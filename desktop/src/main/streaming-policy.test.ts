import { describe, expect, it } from "vitest";
import { LOCAL_MODEL_IDS, LOCAL_MODELS, STREAMING_CAPTIONS } from "../shared/localModels";
import { resolveCaptionFallback, shouldUseStreamingCaptions } from "./streaming-policy";

const ON = { enabled: true, modelReady: true, workerHealthy: true, hasPartialSink: true };

describe("shouldUseStreamingCaptions", () => {
  it("全满足才启用", () => {
    expect(shouldUseStreamingCaptions(ON)).toBe(true);
  });
  it("开关关则不用（其余全满足）", () => {
    expect(shouldUseStreamingCaptions({ ...ON, enabled: false })).toBe(false);
  });
  it("模型未就绪降级", () => {
    expect(shouldUseStreamingCaptions({ ...ON, modelReady: false })).toBe(false);
  });
  it("worker 不健康降级", () => {
    expect(shouldUseStreamingCaptions({ ...ON, workerHealthy: false })).toBe(false);
  });
  it("无字幕消费者（onPartial 缺席）不用", () => {
    expect(shouldUseStreamingCaptions({ ...ON, hasPartialSink: false })).toBe(false);
  });
});

describe("resolveCaptionFallback", () => {
  it("终稿成功一律用终稿", () => {
    expect(resolveCaptionFallback({ ok: true, text: "终稿" }, "草稿")).toEqual({ ok: true, text: "终稿" });
  });
  it("终稿失败且草稿非空：草稿兜底", () => {
    const out = resolveCaptionFallback({ ok: false, error: new Error("boom") }, " 草稿 ");
    expect(out).toEqual({ ok: true, text: "草稿" });
  });
  it("终稿失败且草稿为空串/空白：原样失败", () => {
    for (const draft of [null, "", "   "]) {
      const out = resolveCaptionFallback({ ok: false, error: "boom" }, draft);
      expect(out.ok).toBe(false);
      expect((out as { error: unknown }).error).toBe("boom");
    }
  });
  it("终稿成功时草稿为 null 也不影响", () => {
    expect(resolveCaptionFallback({ ok: true, text: "终稿" }, null)).toEqual({ ok: true, text: "终稿" });
  });
});

describe("流式模型卡纯度", () => {
  it("不出现在转写模型下拉与导入白名单", () => {
    // as const 字面量类型在编译期就会挡住混入，运行时断言兜底防止将来有人放宽 as const
    const ids = LOCAL_MODEL_IDS as string[];
    const catalog = LOCAL_MODELS.map((m) => m.id) as string[];
    expect(catalog).not.toContain(STREAMING_CAPTIONS);
    expect(ids).not.toContain(STREAMING_CAPTIONS);
  });
});
