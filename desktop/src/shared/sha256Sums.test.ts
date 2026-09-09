import { describe, expect, it } from "vitest";
import { sha256FromDigest, sha256FromSums } from "./sha256Sums";

const H = "a".repeat(64);
const HUP = H.toUpperCase();
const OTHER = "b".repeat(64);
const NAME = "SpeakType-Setup-9.9.9.exe";

describe("sha256FromSums", () => {
  it("命中标准小写行", () => {
    expect(sha256FromSums(`${H}  ${NAME}\n`, NAME)).toBe(H);
  });
  it("同清单他文件不误取", () => {
    expect(sha256FromSums(`${OTHER}  other.exe\n${H}  ${NAME}\n`, NAME)).toBe(H);
  });
  it("清单缺目标文件名返回 undefined", () => {
    expect(sha256FromSums(`${OTHER}  other.exe\n`, NAME)).toBeUndefined();
  });
  it("带路径前缀的行命中", () => {
    expect(sha256FromSums(`${H}  releases/win/${NAME}\n`, NAME)).toBe(H);
  });
  it("无斜杠的字面后缀不误配", () => {
    expect(sha256FromSums(`${H}  x${NAME}\n`, NAME)).toBeUndefined();
  });
  it("大写哈希接受并统一转小写（PowerShell Get-FileHash 兼容）", () => {
    expect(sha256FromSums(`${HUP}  ${NAME}\n`, NAME)).toBe(H);
  });
  it("sha256sum 二进制标记 * 兼容", () => {
    expect(sha256FromSums(`${H} *${NAME}\n`, NAME)).toBe(H);
  });
  it("空清单与空文件名", () => {
    expect(sha256FromSums("", NAME)).toBeUndefined();
    expect(sha256FromSums(`${H}  ${NAME}\n`, "")).toBeUndefined();
  });
});

describe("sha256FromDigest", () => {
  it("标准 sha256 前缀命中", () => {
    expect(sha256FromDigest(`sha256:${H}`)).toBe(H);
  });
  it("大写 hex 与大写算法名统一转小写", () => {
    expect(sha256FromDigest(`SHA256:${HUP}`)).toBe(H);
  });
  it("缺省返回 undefined", () => {
    expect(sha256FromDigest(undefined)).toBeUndefined();
  });
  it("空串与其他算法返回 undefined", () => {
    expect(sha256FromDigest("")).toBeUndefined();
    expect(sha256FromDigest(`sha512:${H}`)).toBeUndefined();
    expect(sha256FromDigest(`md5:${H.slice(0, 32)}`)).toBeUndefined();
  });
  it("长度不符的 hex 拒绝", () => {
    expect(sha256FromDigest(`sha256:${H.slice(0, 63)}`)).toBeUndefined();
    expect(sha256FromDigest(`sha256:${H}0`)).toBeUndefined();
  });
  it("前后缀杂讯拒绝（只收整串精确匹配）", () => {
    expect(sha256FromDigest(`sha256: ${H}`)).toBeUndefined();
    expect(sha256FromDigest(` sha256:${H}`)).toBeUndefined();
    expect(sha256FromDigest(`sha256:${H}\n`)).toBeUndefined();
  });
});
