import { describe, expect, it } from "vitest";
import { versionNewer } from "./compareVersions";

describe("versionNewer", () => {
  it("常规 minor/patch 比较", () => {
    expect(versionNewer("v0.18.0", "0.17.2")).toBe(true);
    expect(versionNewer("0.17.1", "0.17.2")).toBe(false);
    expect(versionNewer("v0.17.2", "0.17.2")).toBe(false);
  });
  it("v 前缀可选", () => {
    expect(versionNewer("0.18.0", "v0.17.2")).toBe(true);
  });
  it("段数不等时短的按 0 补齐（相等语义）", () => {
    expect(versionNewer("0.18", "0.18.0")).toBe(false);
    expect(versionNewer("0.18.1", "0.18")).toBe(true);
  });
  it("非数字段：等前缀时按不可比返回 false；数字段先出现差异则按数字比较", () => {
    expect(versionNewer("beta", "0.17.2")).toBe(false);
    expect(versionNewer("0.17.2-beta", "0.17.2")).toBe(false);
    // 18 与 17 在到达 beta 段之前就已分出高下
    expect(versionNewer("v0.18.0", "0.17.1-test.1")).toBe(true);
  });
});
