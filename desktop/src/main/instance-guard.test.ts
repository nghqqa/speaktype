import { describe, expect, it, vi } from "vitest";
// 模块顶层 import electron/electron-log：纯函数测试只需 describeInstancePath，
// 依赖按 watchedit.test.ts 同款方式 mock 掉
vi.mock("electron", () => ({ app: { isPackaged: false, getVersion: () => "0.0.0", getPath: () => "/tmp" } }));
vi.mock("electron-log/main.js", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
import { describeInstancePath } from "./instance-guard";

const HOME = "C:\\Users\\ngh\\AppData\\Roaming";

describe("describeInstancePath（双实例提示里的路径压缩）", () => {
  it("home 前缀替换为 ~", () => {
    expect(describeInstancePath(`${HOME}\\SpeakType`, HOME)).toBe("~\\SpeakType");
  });
  it("路径等于 home 本身也收敛", () => {
    expect(describeInstancePath(HOME, HOME)).toBe("~");
  });
  it("非 home 前缀不动（绿色版在任意盘符）", () => {
    expect(describeInstancePath("E:\\tools\\SpeakType-data", HOME)).toBe("E:\\tools\\SpeakType-data");
  });
  it("空 home 不误伤", () => {
    expect(describeInstancePath(`${HOME}\\SpeakType`, "")).toBe(`${HOME}\\SpeakType`);
  });
  it("超长路径截中间保两端", () => {
    const long = "C:\\" + "a".repeat(100) + "\\SpeakType-data";
    const out = describeInstancePath(long, HOME);
    expect(out.length).toBeLessThan(long.length);
    expect(out.startsWith("C:\\aaa")).toBe(true);
    expect(out.endsWith("SpeakType-data")).toBe(true);
    expect(out).toContain("…");
  });
  it("72 字符以内不截断", () => {
    const s = "E:\\" + "b".repeat(40);
    expect(describeInstancePath(s, HOME)).toBe(s);
  });
});
