import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { app, shell } from "electron";
import log from "electron-log/main.js";
import pkg from "../../package.json";
import { downloadFile, DownloadCancelled, hashFile, partialProgress } from "./download";
import type { UpdateCheck, UpdateInfo, UpdateState } from "../shared/types";

/**
 * 应用内更新：检查 GitHub latest release → 复用 download.ts 断点续传下载安装包（单源直链）
 * → NSIS 静默安装（/S，per-user 无需提权）后重启。
 *
 * 不用 electron-updater 的原因：发布流程是手工上传、release 资产里没有 latest.yml
 * （GitHub provider 必需），二进制未签名也无法做发布者校验；而本仓库自带的下载器已有
 * 停滞检测/换源/续传/进度推送，直接复用更贴合现有架构。macOS 未签名，保持只提示不更新。
 */

const RELEASE_API = "https://api.github.com/repos/wookat/speaktype/releases/latest";
/** 安装包只准从 GitHub 自家域取（资产直链 302 到 *.githubusercontent.com），跳到其他主机的重定向直接断开 */
const TRUSTED_HOST = /^(?:[a-z0-9-]+\.)*(?:github\.com|githubusercontent\.com)$/i;
export const trustedUpdateHost = (hostname: string): boolean => TRUSTED_HOST.test(hostname);
/** 手动检查也不必每次打 API：同一会话内缓存一会儿，防连点/反复开关页撞匿名限额 */
const CHECK_CACHE_MS = 10 * 60_000;
/** 半开连接下 fetch 会永久挂起，与下载侧 stallGuard 的标准对齐给个超时 */
const CHECK_TIMEOUT_MS = 15_000;

/** 版本号比大小："v0.18.0" vs "0.17.2"，逐段数字比较（与关于页同名实现一致，主进程侧独立一份） */
export function versionNewer(tag: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const [a, b] = [parse(tag), parse(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0];
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
}

/** dev 模式 app.getVersion() 返回 Electron 版本，与启动日志同款约定取 package.json 版本 */
function currentVersion(): string {
  return app.isPackaged ? app.getVersion() : pkg.version;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  /** GitHub 上传时自动计算的 `sha256:<hex>`，走 api.github.com 元数据通道，与资产下载链路无关 */
  digest?: string;
}

interface Release {
  tag_name?: string;
  assets?: ReleaseAsset[];
}

/** release tag 只认 v?主.次.补丁：其他字符串（API 异常/恶意内容）不进入版本比较与界面 */
const TAG_RE = /^v?\d+\.\d+\.\d+$/;

let releaseCache: { at: number; release: Release } | null = null;
let releaseInflight: Promise<Release> | null = null;

/**
 * 拉 latest release 元数据：关于页检查与启动新版提示共用这一份（同一时刻只发一个请求、结果缓存 10 分钟），
 * 匿名 API 限额 60 次/时/IP，共享出口 IP 下每省一次都算
 */
export function fetchLatestRelease(): Promise<Release> {
  if (releaseCache && Date.now() - releaseCache.at < CHECK_CACHE_MS) return Promise.resolve(releaseCache.release);
  if (releaseInflight) return releaseInflight;
  releaseInflight = (async () => {
    try {
      const res = await fetch(RELEASE_API, {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const release = (await res.json()) as Release;
      if (!TAG_RE.test(release.tag_name ?? "")) throw new Error(`unexpected tag ${JSON.stringify(release.tag_name)}`);
      releaseCache = { at: Date.now(), release };
      return release;
    } finally {
      releaseInflight = null;
    }
  })();
  return releaseInflight;
}

/** 最新版 tag（如 "v0.19.0"）；网络失败抛错，由调用方决定重试/静默 */
export async function latestReleaseTag(): Promise<string> {
  return (await fetchLatestRelease()).tag_name ?? "";
}

/** 解析资产元数据的 digest 字段；形式不对（缺省/其他算法）返回 undefined */
export function sha256FromDigest(digest: string | undefined): string | undefined {
  const m = /^sha256:([0-9a-f]{64})$/i.exec(digest ?? "");
  return m?.[1]?.toLowerCase();
}

/**
 * 按 tag 记住已解析过的安装目标（含「该版本拿不到哈希」的否定结论，同样只保留 CHECK_CACHE_MS，SHA256SUMS.txt 临时拉不到不至于整会话无法重试）；
 * release 元数据本身的缓存见 fetchLatestRelease
 */
let cached: { at: number; tag: string; info: UpdateInfo | null } | null = null;

function updateDir(): string {
  return join(app.getPath("userData"), "updates");
}

/** 新目标确定后顺手清掉旧版本安装包与残片（.exe / .exe.part / .exe.part.json），updates 目录不留多个 ~100MB 文件 */
function pruneOldInstallers(keep: string): void {
  // 目录只归更新器使用，不在保留名单（当前目标的三个落盘名）里的一律清掉
  const keepSet = new Set([keep, `${keep}.part`, `${keep}.part.json`]);
  try {
    for (const f of readdirSync(updateDir())) {
      if (!keepSet.has(f)) rmSync(join(updateDir(), f), { force: true });
    }
  } catch {
    // 目录不存在等：无事可清
  }
}

/** 从 release 的 SHA256SUMS.txt 文本里取指定文件的 sha256（sha256sum 格式：`<hash>␣␣<文件名>`）。
 *  大写哈希也收（PowerShell Get-FileHash 产出大写），统一转小写与 hashFile 摘要比对 */
function sha256FromSums(text: string, fileName: string): string | undefined {
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (m && (m[2] === fileName || m[2]?.endsWith(`/${fileName}`))) return m[1]!.toLowerCase();
  }
  return undefined;
}

/**
 * 检查更新：四态给关于页——有新版可应用内更新 / 有新版但只能去 Releases（mac、便携以外的无哈希发布、无安装包资产）/
 * 已是最新 / 检查失败。应用内更新仅 Windows；portable 版没有安装器语义，由 UI 换成「打开所在文件夹」
 */
export async function checkUpdate(): Promise<UpdateCheck> {
  let release: Release;
  try {
    release = await fetchLatestRelease();
  } catch (error) {
    // 检查失败不弹窗：关于页显示可重试的失败态，这里记日志即可
    log.warn("update check failed", error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
  const tag = release.tag_name ?? "";
  if (!versionNewer(tag, currentVersion())) return { status: "upToDate", tag };
  if (process.platform !== "win32") return { status: "releaseOnly", tag };
  if (cached && cached.tag === tag && Date.now() - cached.at < CHECK_CACHE_MS) {
    if (cached.info) {
      currentInfo = cached.info;
      pruneOldInstallers(cached.info.fileName);
      return { status: "available", info: cached.info };
    }
    return { status: "releaseOnly", tag };
  }
  const asset = release.assets?.find((a) => /^SpeakType-Setup-.*\.exe$/.test(a.name));
  if (!asset) {
    cached = { at: Date.now(), tag, info: null };
    return { status: "releaseOnly", tag };
  }
  // 安装包哈希首选 API 资产元数据的 digest（与下载链路分离，改不了正文的人也改不了它），
  // 次选 release 里的 SHA256SUMS.txt；两者都拿不到则不提供应用内更新（fail-closed），
  // 关于页退回「有新版 → Releases」的纯提示——不校验就执行的安装包不应该存在
  let sha256 = sha256FromDigest(asset.digest);
  const sumsAsset = release.assets?.find((a) => a.name === "SHA256SUMS.txt");
  if (!sha256 && sumsAsset) {
    try {
      const sums = await fetch(sumsAsset.browser_download_url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
      // 非 2xx 与网络异常同样要留排障线索：将来「为什么没校验」的追问里这是半边证据
      if (sums.ok) sha256 = sha256FromSums(await sums.text(), asset.name);
      else log.warn(`update sums fetch HTTP ${sums.status}`);
    } catch (error) {
      log.warn("update sums fetch failed", error);
    }
  }
  if (!sha256) {
    log.warn(`update ${tag}: no sha256 for ${asset.name} (asset digest / SHA256SUMS.txt), in-app update disabled`);
    cached = { at: Date.now(), tag, info: null };
    return { status: "releaseOnly", tag };
  }
  const info: UpdateInfo = {
    tag,
    size: asset.size,
    fileName: asset.name,
    portable: !!process.env.PORTABLE_EXECUTABLE_DIR,
    url: asset.browser_download_url,
    sha256,
  };
  cached = { at: Date.now(), tag, info };
  currentInfo = info;
  pruneOldInstallers(asset.name);
  return { status: "available", info };
}

let notify: ((s: UpdateState) => void) | null = null;

/** 主进程注册推送回调（与 onVadStatus 同款模式） */
export function onUpdateState(cb: (s: UpdateState) => void): void {
  notify = cb;
}

let state: UpdateState | null = null;

function setState(next: UpdateState): void {
  state = next;
  notify?.(next);
}

let currentInfo: UpdateInfo | null = null;
let downloadedPath: string | null = null;
let abort: AbortController | null = null;

/** 已下完整包且大小与远端一致：restart 后据此直接显示「安装并重启」，不再重下 ~100MB。
 * size>0 防御 0 字节资产与 0 字节空文件的假就绪（会造出 error→retry→ready 死循环） */
function installerReady(info: UpdateInfo): string | null {
  if (info.size <= 0) return null;
  const dest = join(updateDir(), info.fileName);
  return existsSync(dest) && statSync(dest).size === info.size ? dest : null;
}

/** 恢复用：页面打开时读当前状态；已下完的显示 ready，否则有可续传残片时按残片进度显示（partial 标记区分于活跃下载） */
export function updateState(): UpdateState | null {
  if (state) return state;
  const info = currentInfo ?? cached?.info;
  if (!info) return null;
  if (installerReady(info)) return { phase: "ready", progress: 100 };
  const partial = partialProgress(join(updateDir(), info.fileName));
  if (!partial) return null;
  return { phase: "downloading", progress: Math.floor((partial.got / partial.total) * 100), partial: true };
}

/**
 * 下载安装包：单源 GitHub 直链（重定向也锁在 GitHub 自家域），不加第三方代理镜像——会被执行的
 * 二进制不让不明中间人供；下完按 release 元数据的 sha256 校验，断点续传/停滞重试语义与模型下载一致。
 * 目标只取主进程 checkUpdate 的结果，不吃渲染层传参（fileName 会直接进 join 与 URL，不可信）
 */
export async function downloadUpdate(): Promise<void> {
  const info = currentInfo ?? cached?.info;
  if (!info || abort) return;
  const dest = join(updateDir(), info.fileName);
  // 上次已下完未安装：直接就绪
  if (installerReady(info)) {
    downloadedPath = dest;
    setState({ phase: "ready", progress: 100 });
    return;
  }
  abort = new AbortController();
  // 用磁盘残片进度做起点：续传场景下进度条从上次位置继续，不在建连间隙跳回 0
  const seed = partialProgress(dest);
  setState({ phase: "downloading", progress: seed ? Math.floor((seed.got / seed.total) * 100) : 0 });
  try {
    await downloadFile(
      [info.url],
      dest,
      (got, total) => {
        if (total > 0) setState({ phase: "downloading", progress: Math.floor((got / total) * 100) });
      },
      abort.signal,
      (phase, source) => {
        // retrying/verifying 期间保留已到百分比，进度条不回跳
        setState({ phase, progress: state?.progress ?? 0, ...(phase === "retrying" && source ? { source } : {}) });
      },
      info.sha256,
      trustedUpdateHost,
    );
    downloadedPath = dest;
    setState({ phase: "ready", progress: 100 });
    log.info(`update installer ready: ${info.fileName}`);
  } catch (error) {
    if (error instanceof DownloadCancelled) {
      // 用户取消：残片保留，状态切到「可续传」而非清空——正在显示的进度条立即变成续传按钮
      setState({ phase: "downloading", progress: state?.progress ?? 0, partial: true });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    setState({ phase: "error", progress: state?.progress ?? 0, error: message });
    log.warn("update download failed", error);
  } finally {
    abort = null;
  }
}

export function cancelUpdateDownload(): void {
  abort?.abort(new DownloadCancelled());
}

let installing = false;

/** 安装并退出：NSIS assisted + /S 静默装（per-user），装完由安装器拉起新版本；便携版只定位文件 */
export async function installUpdate(): Promise<void> {
  if (installing) return;
  const info = currentInfo ?? cached?.info;
  // updateState 的就绪快路径只报状态不落路径：重启恢复出的 ready 态点安装时按需补齐，
  // 否则 installUpdate 拿着 null 直接 return，界面上是「点了没反应」的死按钮
  if (!downloadedPath && info) downloadedPath = installerReady(info);
  if (!downloadedPath || !info) return;
  if (info.portable) {
    void shell.showItemInFolder(downloadedPath);
    return;
  }
  // 执行前再校验一次：就绪态只看了大小（重启恢复的文件没算过哈希），且下完到点安装之间文件可能被改；
  // 安装包是会被执行的二进制，算 100MB 约 1s（worker 线程）换一次确定性值得
  installing = true;
  try {
    setState({ phase: "verifying", progress: 100 });
    const actual = await hashFile(downloadedPath);
    if (actual !== info.sha256) {
      rmSync(downloadedPath, { force: true });
      downloadedPath = null;
      setState({ phase: "error", progress: 0, error: "sha256 mismatch (installer)" });
      log.warn(`update install refused: sha256 mismatch for ${info.fileName}`);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState({ phase: "error", progress: 100, error: message });
    log.warn("update install verify failed", error);
    return;
  } finally {
    installing = false;
  }
  log.info(`update install: quitting and running ${downloadedPath}`);
  // 先拉起安装器再退出：spawn detached 让它脱离本进程生命周期，app.quit() 异步收尾不抢跑。
  // --force-run 必须带：NSIS assisted 安装器静默（/S）模式默认装完不自启，只有该标志才拉起新版本
  //（模板 installSection.nsh：${if} ${isForceRun} ${andIf} ${Silent} → doStartApp，本机已实测）
  try {
    const child = spawn(downloadedPath, ["/S", "--force-run"], { detached: true, stdio: "ignore" });
    child.unref();
    app.quit();
  } catch (error) {
    // 安装包被杀软隔离/手删等：回到错误态给重试入口，而不是让拒绝悬空、按钮无响应
    const message = error instanceof Error ? error.message : String(error);
    setState({ phase: "error", progress: 100, error: message });
    log.warn("update install failed", error);
  }
}
