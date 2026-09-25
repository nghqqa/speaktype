import { createServer, connect } from "node:net";
import { app } from "electron";
import log from "electron-log/main.js";
import pkg from "../../package.json";

/**
 * 跨配置目录的双实例防护。单实例锁（requestSingleInstanceLock）按 userData 隔离，
 * 「正式版 + 绿色版/测试版」是合法并存——但全局键盘钩子是系统级的，两个实例都会
 * 响应同一次热键：一次按键两边录音、文字落两遍（真实事故见 2026-09-12 会话）。
 * 这里用固定名字的命名管道做在场探测：先到的实例持有管道并应答自身版本与配置
 * 目录，后来的实例连不上即知冲突，把「对方是谁」告诉用户，由用户决定关哪个。
 */

const PIPE_PATH = "\\\\.\\pipe\\speaktype-instance-guard";
// 持有者应答窗口：后来者连上后只等这一会儿，拿不到信息也照常报警（退化为不带路径的提示）
const QUERY_TIMEOUT_MS = 1500;

export interface InstanceInfo {
  version: string;
  userDataPath: string;
}

/** 把配置路径压缩成用户可读的形式：_HOME 前缀替换为 ~，超长截中间（纯逻辑，直接单测） */
export function describeInstancePath(path: string, home: string): string {
  let out = path;
  if (home && (out === home || out.startsWith(home + "\\"))) out = "~" + out.slice(home.length);
  if (out.length > 72) out = `${out.slice(0, 36)}…${out.slice(-32)}`;
  return out;
}

function localInfo(): InstanceInfo {
  return { version: app.isPackaged ? app.getVersion() : pkg.version, userDataPath: app.getPath("userData") };
}

/**
 * 启动在场探测。返回 null = 本实例成为持有者（无冲突）；返回对方信息 = 已有另一个
 * 实例在跑。持有者只默默应答，不主动打扰；报警是后来者的职责（正是刚制造冲突的人）。
 */
export function startInstanceGuard(): Promise<InstanceInfo | null> {
  return new Promise((resolve) => {
    const holder = createServer((socket) => {
      // 持有者协议：任何连接进来就回一行自身信息，不等请求内容（客户端只发连接）
      try {
        socket.end(JSON.stringify(localInfo()) + "\n");
      } catch {
        // 对方过早断开：无事
      }
    });
    holder.once("error", () => {
      // 端口被占 = 已有实例在场：连上去问清楚是谁（拿不到也报警，只是少了路径）
      const client = connect(PIPE_PATH);
      const done = (info: InstanceInfo | null) => {
        client.destroy();
        clearTimeout(timer);
        resolve(info ?? { version: "", userDataPath: "" });
      };
      const timer = setTimeout(() => done(null), QUERY_TIMEOUT_MS);
      timer.unref();
      let buf = "";
      client.once("connect", () => {
        log.info("instance guard: another SpeakType is already running");
      });
      client.once("error", () => done(null));
      client.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const nl = buf.indexOf("\n");
        if (nl < 0) return;
        try {
          done(JSON.parse(buf.slice(0, nl)) as InstanceInfo);
        } catch {
          done(null);
        }
      });
      client.once("close", () => {
        if (!buf.includes("\n")) done(null);
      });
    });
    holder.listen(PIPE_PATH, () => {
      log.info("instance guard: holding");
      resolve(null);
    });
  });
}
