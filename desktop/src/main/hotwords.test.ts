import { describe, expect, it } from "vitest";
import { correctHotwords } from "./hotwords";

// 语义口径来自仓库测试文档：热词只按同音/近音替换（拼音归并），改音不替换、ASCII 词走模糊匹配
describe("correctHotwords", () => {
  it("同音热词替换转写中的近音片段（答覆 ← 答复）", () => {
    expect(correctHotwords("请给我答复", ["答覆"])).toBe("请给我答覆");
  });
  it("不同音的热词不做替换（回复 替不了 答复）", () => {
    expect(correctHotwords("请给我答复", ["回复"])).toBe("请给我答复");
  });
  it("平翘舌（zh/z）归并类内近音可替换（四/是，实测确认）", () => {
    expect(correctHotwords("这是四个问题", ["这事"])).toBe("这事四个问题");
  });
  it("跨混淆类不同音不替换（自知：zhi-zi 首音节可归并，但 chi≠zhi 次音节出类）", () => {
    expect(correctHotwords("我自知这件事", ["支持"])).toBe("我自知这件事");
  });
  it("日文语境（含假名）不替换汉字词", () => {
    expect(correctHotwords("電話をかける", ["电话"])).toBe("電話をかける");
  });
  it("空词典与空文本", () => {
    expect(correctHotwords("随便一句话", [])).toBe("随便一句话");
    expect(correctHotwords("", ["热词"])).toBe("");
  });
});
