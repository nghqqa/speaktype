import { describe, expect, it } from "vitest";
import { normalizeFireRedCaps } from "./localModels";

describe("normalizeFireRedCaps（FireRedASR 全大写英文归一）", () => {
  it("整词全大写转小写", () => {
    expect(normalizeFireRedCaps("请把这份 REPORT 发到我的 EMAIL")).toBe("请把这份 report 发到我的 email");
    expect(normalizeFireRedCaps("是否正常 CHECK，如果")).toBe("是否正常 check，如果");
  });
  it("缩写白名单保留大写", () => {
    expect(normalizeFireRedCaps("抄送一份给 HR 部门")).toBe("抄送一份给 HR 部门");
    expect(normalizeFireRedCaps("调一下 API 和 GPT4")).toBe("调一下 API 和 GPT4");
    expect(normalizeFireRedCaps("做个 PPT 和 PDF")).toBe("做个 PPT 和 PDF");
  });
  it("非全大写词不动（混合大小写/首字母大写）", () => {
    expect(normalizeFireRedCaps("iPhone 和 Word 不变")).toBe("iPhone 和 Word 不变");
  });
  it("单个大写字母不动（A 桥牌等级等语境）", () => {
    expect(normalizeFireRedCaps("得到一个 A")).toBe("得到一个 A");
  });
  it("纯中文与数字不动", () => {
    expect(normalizeFireRedCaps("二零二六年九月 123321")).toBe("二零二六年九月 123321");
  });
  it("白名单外的品牌缩写也会转小写（已声明的取舍）", () => {
    expect(normalizeFireRedCaps("IBM 和 NASA")).toBe("ibm 和 nasa");
  });
  it("空串与纯空格安全", () => {
    expect(normalizeFireRedCaps("")).toBe("");
    expect(normalizeFireRedCaps("  ")).toBe("  ");
  });
});
