import { describe, expect, it } from "vitest";
import { countWords, countWordsByScript, legacySavedMs, savedMsFor } from "./stats";

describe("countWordsByScript", () => {
  it("CJK 每字计 1，拉丁连续串计 1", () => {
    expect(countWordsByScript("帮我跟老板说")).toEqual({ cjk: 6, latin: 0 });
    expect(countWordsByScript("send the report now")).toEqual({ cjk: 0, latin: 4 });
    expect(countWordsByScript("costs $11 today")).toEqual({ cjk: 0, latin: 3 });
  });
  it("混排相加", () => {
    expect(countWords("用 Electron 写 3 个页面")).toBe(4 + 3);
  });
});

describe("savedMsFor", () => {
  it("纯 CJK：每字约 700ms 节省（60/200 词每分口径差，浮点运算）", () => {
    expect(savedMsFor("十个字十个字十个字")).toBeCloseTo(9 * 700, 5);
  });
  it("纯拉丁：每词约 1100ms", () => {
    expect(savedMsFor("one two three four five six")).toBeCloseTo(6 * 1100, 5);
  });
});

describe("legacySavedMs", () => {
  it("CJK 界面语言按字口径，其余按英文口径", () => {
    expect(legacySavedMs(100, "zh-CN")).toBeCloseTo(100 * 700, 5);
    expect(legacySavedMs(100, "en-US")).toBeCloseTo(100 * 1100, 5);
    expect(legacySavedMs(100, "ja")).toBeCloseTo(100 * 700, 5);
  });
});
