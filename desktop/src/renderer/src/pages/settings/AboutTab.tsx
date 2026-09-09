import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../../api";
import type { Translator } from "../../i18n";
import type { UpdateCheck, UpdateInfo, UpdateState } from "../../../../shared/types";
import { Row } from "../../components/Row";
import { REPO_URL, SITE_URL } from "../../constants";

/** 更新下载的阶段文案：retrying/verifying 附在进度条旁，让「冻住」可解释 */
function updatePhaseText(st: UpdateState, t: Translator): string | null {
  if (st.phase === "retrying") return t("settings.about.updatePhaseRetrying");
  if (st.phase === "verifying") return t("settings.about.updatePhaseVerifying");
  return null;
}

/** 检查失败原因映射成人话：主进程回传的是 fetch/HTTP 原文，不直出给用户 */
function checkFailedText(error: string, t: Translator): string {
  if (/HTTP (?:403|429)/.test(error)) return t("settings.about.checkFailedRateLimit");
  if (/^HTTP \d+/.test(error)) return t("settings.about.checkFailedServer");
  if (/aborted|timeout|fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|network/i.test(error)) {
    return t("settings.about.checkFailedNetwork");
  }
  return t("settings.about.checkFailedOther");
}

/** 版本区块里的更新卡片：有新版 → 下载（进度/断点续传/换源提示）→ 安装并重启 */
function UpdateCard(props: { t: Translator; info: UpdateInfo; state: UpdateState | null }) {
  const { t, info, state: st } = props;
  const sizeMb = Math.round(info.size / 1024 / 1024);
  // st 经 onUpdateState 推送、可能在组件挂载后才异步到达：本地留一份已见过的最新状态，
  // 避免推送间隙（如取消后主进程置 partial 前的一瞬）进度条闪回初始形态
  const [seen, setSeen] = useState<UpdateState | null>(st);
  useEffect(() => setSeen(st), [st]);
  const phaseText = seen ? updatePhaseText(seen, t) : null;

  return (
    <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
      <div className="flex flex-wrap items-center gap-2">
        <span>{t("settings.about.updateAvailable", { version: info.tag })}</span>
        {(!seen || seen.partial) && (
          <button
            className="font-medium underline"
            onClick={() => void api.updateDownload()}
          >
            {seen?.partial
              ? t("settings.about.updateResume", { progress: String(seen.progress) })
              : t("settings.about.updateDownload", { size: String(sizeMb) })}
          </button>
        )}
        {seen && !seen.partial && seen.phase === "downloading" && (
          <button className="font-medium underline" onClick={() => void api.updateCancel()}>
            {t("common.cancel")}
          </button>
        )}
        {seen?.phase === "ready" && (
          <button className="font-medium underline" onClick={() => void api.updateInstall()}>
            {info.portable ? t("settings.about.updateOpenFolder") : t("settings.about.updateInstall")}
          </button>
        )}
        {seen?.phase === "error" && (
          <button className="font-medium underline" onClick={() => void api.updateDownload()}>
            {t("settings.about.updateRetry")}
          </button>
        )}
        <button
          className="underline"
          onClick={() => void api.openExternal(`${REPO_URL}/releases/latest`)}
        >
          Releases
        </button>
      </div>
      {info.portable && !seen && (
        <div className="mt-1 text-amber-600/80">{t("settings.about.updatePortableHint")}</div>
      )}
      {seen && seen.phase !== "ready" && seen.phase !== "error" && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-amber-100">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${seen.progress}%` }} />
          </div>
          <span>
            {seen.progress}%{phaseText ? ` · ${phaseText}` : ""}
          </span>
        </div>
      )}
      {seen?.phase === "error" && (
        <div className="mt-1 text-red-600">{t("settings.about.updateFailed", { error: seen.error ?? "" })}</div>
      )}
    </div>
  );
}

/** 关于页的检查状态：idle = 未检查（自动检查关闭时的初始态），checking = 请求中，其余为主进程回传的四态 */
type CheckView = { status: "idle" } | { status: "checking" } | UpdateCheck;

function AboutTab(props: { t: Translator; version: string; commit: string; autoUpdateCheck: boolean }) {
  const { t } = props;
  const [check, setCheck] = useState<CheckView>({ status: "idle" });
  const [upState, setUpState] = useState<UpdateState | null>(null);
  // 连点「检查更新」只认最后一次的结果（主进程有 10 分钟缓存 + in-flight 去重，这里只防旧回包覆盖新状态）
  const checkSeq = useRef(0);

  const runCheck = useCallback(() => {
    const seq = ++checkSeq.current;
    setCheck({ status: "checking" });
    // 先 check 后补拉 state：check 才会在主进程确定当前目标（并清掉旧版本残片），
    // 重启后的「继续下载（已 x%）」/「已就绪」依赖这个顺序才能恢复出来
    void api.updateCheck().then((result) => {
      if (seq !== checkSeq.current) return;
      setCheck(result);
      if (result.status === "available") void api.updateState().then(setUpState);
    });
  }, []);

  useEffect(() => {
    // 自动检查关闭 = 用户不想让程序自己联网：打开关于页也不拨号，等用户点「检查更新」
    if (props.autoUpdateCheck) runCheck();
    // 本会话已有进行中状态时（正在下载）则立即恢复，不必等 check
    void api.updateState().then(setUpState);
    const off = api.onUpdateState(setUpState);
    return off;
    // 只在挂载时按开关决定是否自动检查；期间切开关不重复拨号
  }, [runCheck]);

  const checking = check.status === "checking";
  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.about.version")}</div>
        <Row label={`${t("app.name")} ${props.version} (${props.commit})`}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-60"
              disabled={checking}
              onClick={runCheck}
            >
              <RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              {t("settings.about.checkUpdate")}
            </button>
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => void api.openExternal(`${REPO_URL}/releases`)}
            >
              Releases <ExternalLink className="inline h-3.5 w-3.5" />
            </button>
          </div>
        </Row>
        {check.status === "checking" && (
          <div className="mt-2 text-xs text-slate-400" role="status">
            {t("settings.about.checking")}
          </div>
        )}
        {check.status === "upToDate" && (
          <div className="mt-2 text-xs text-emerald-600" role="status">
            {t("settings.about.upToDate", { version: props.version })}
          </div>
        )}
        {check.status === "failed" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-600" role="status">
            <span>{t("settings.about.checkFailed", { reason: checkFailedText(check.error, t) })}</span>
            <button className="font-medium underline" onClick={runCheck}>
              {t("settings.about.updateRetry")}
            </button>
            <button className="underline" onClick={() => void api.openExternal(`${REPO_URL}/releases/latest`)}>
              Releases
            </button>
          </div>
        )}
        {check.status === "available" && <UpdateCard t={t} info={check.info} state={upState} />}
        {check.status === "releaseOnly" && (
          <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {t("settings.about.updateAvailable", { version: check.tag })}{" "}
            <button
              className="font-medium underline"
              onClick={() => void api.openExternal(`${REPO_URL}/releases/latest`)}
            >
              Releases
            </button>
          </div>
        )}
        {!props.autoUpdateCheck && check.status === "idle" && (
          <div className="mt-2 text-xs text-slate-400">{t("settings.about.autoCheckOffHint")}</div>
        )}
        <Row label={t("settings.about.logs")}>
          <button
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => void api.openLogs()}
          >
            {t("settings.about.logsOpen")}
          </button>
        </Row>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.about.openSource")}</div>
        <div className="mt-1 text-xs text-slate-400">{t("settings.about.openSourceDesc")}</div>
        <Row label={t("settings.about.website")}>
          <button className="text-sm text-indigo-500 hover:underline" onClick={() => void api.openExternal(SITE_URL)}>
            speaktype.zalize.com <ExternalLink className="inline h-3.5 w-3.5" />
          </button>
        </Row>
        <Row label={t("settings.about.repo")}>
          <button className="text-sm text-indigo-500 hover:underline" onClick={() => void api.openExternal(REPO_URL)}>
            github.com/wookat/speaktype <ExternalLink className="inline h-3.5 w-3.5" />
          </button>
        </Row>
        <Row label={t("settings.about.issues")}>
          <button
            className="text-sm text-indigo-500 hover:underline"
            onClick={() => void api.openExternal(`${REPO_URL}/issues`)}
          >
            GitHub Issues <ExternalLink className="inline h-3.5 w-3.5" />
          </button>
        </Row>
        <Row label={t("settings.about.license")}>
          <button
            className="text-sm text-indigo-500 hover:underline"
            onClick={() => void api.openExternal(`${REPO_URL}/blob/main/LICENSE`)}
          >
            MIT License <ExternalLink className="inline h-3.5 w-3.5" />
          </button>
        </Row>
        <Row label={t("settings.about.author")}>
          <span className="text-sm text-slate-500">wookat & SpeakType contributors</span>
        </Row>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.about.contribute")}</div>
        <div className="mt-1 text-xs text-slate-400">{t("settings.about.contributeDesc")}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="font-medium">{t("settings.about.privacy")}</div>
        <div className="mt-1 text-xs text-slate-400">{t("settings.about.privacyDesc")}</div>
      </section>
    </>
  );
}
export { AboutTab };
