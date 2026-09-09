import { describe, expect, it } from "vitest";
import { parseVoiceCommands } from "./voiceCommands";

describe("parseVoiceCommands", () => {
  it("精确命中命令词", () => {
    expect(parseVoiceCommands("换行")).toEqual(["newline"]);
    expect(parseVoiceCommands("另起一段")).toEqual(["paragraph"]);
    expect(parseVoiceCommands("删除上一句")).toEqual(["deleteLast"]);
  });
  it("命中英文命令词（大小写归一）", () => {
    expect(parseVoiceCommands("New Line")).toEqual(["newline"]);
    expect(parseVoiceCommands("new paragraph")).toEqual(["paragraph"]);
  });
  it("去尾标点后命中", () => {
    expect(parseVoiceCommands("换行。")).toEqual(["newline"]);
    expect(parseVoiceCommands("删除上一句！")).toEqual(["deleteLast"]);
  });
  it("≥4 字命令词容同长度单字之差", () => {
    expect(parseVoiceCommands("删除上一去")).toEqual(["deleteLast"]);
  });
  it("短词不容错（两字词单字差不是命令）", () => {
    expect(parseVoiceCommands("换舟")).toBeNull();
  });
  it("命令嵌在句中不算命令（照常落字）", () => {
    expect(parseVoiceCommands("帮我换行一下")).toBeNull();
    expect(parseVoiceCommands("先说要点然后换行")).toBeNull();
  });
  it("整条由多个命令组成时逐段解析", () => {
    expect(parseVoiceCommands("换行。另起一段")).toEqual(["newline", "paragraph"]);
  });
  it("任一段不是命令则整条不是命令", () => {
    expect(parseVoiceCommands("换行。今天天气不错")).toBeNull();
  });
  it("空文本与纯标点", () => {
    expect(parseVoiceCommands("")).toBeNull();
    expect(parseVoiceCommands("。。。")).toBeNull();
  });
});
