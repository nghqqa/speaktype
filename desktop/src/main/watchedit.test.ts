import { vi, describe, expect, it } from "vitest";

// watchedit 顶层是 PowerShell 观察器（electron-log + child_process），单测只取纯 diff 逻辑
vi.mock("electron-log/main.js", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { extractCorrections } from "./watchedit";

describe("extractCorrections", () => {
  it("无改动返回空", () => {
    expect(extractCorrections("完全一样", "完全一样")).toEqual([]);
  });
  it("两字中文词整词替换（无共享边界字）产生一处学习项", () => {
    expect(extractCorrections("给我答复", "给我回执")).toEqual([{ wrong: "答复", right: "回执" }]);
  });
  it("被逗号隔开的两处小改动按处拆分为两条", () => {
    // LCS 对齐会把改动归到左词上（开会→开慧），要点是「按处拆分」而非合并成一整段
    expect(extractCorrections("开会，预备一下", "开慧，预域一下")).toEqual([
      { wrong: "开会", right: "开慧" },
      { wrong: "备", right: "域" },
    ]);
  });
  it("共享边界字的中文改动经分词回扩学整词（方案→草案，#392 行为）", () => {
    expect(extractCorrections("方案需要改", "草案需要改")).toEqual([{ wrong: "方案", right: "草案" }]);
  });
  it("英文单词整词替换且边界外扩到完整单词", () => {
    expect(extractCorrections("send the bericht now", "send the report now")).toEqual([
      { wrong: "bericht", right: "report" },
    ]);
  });
  it("实际改动占原文过半视为重写，不产生学习项", () => {
    const before = "今天下午三点在会议室讨论项目进度和预算安排";
    const after = "明天上午十点于大礼堂宣布年度计划与人事调整";
    expect(extractCorrections(before, after)).toEqual([]);
  });
});
