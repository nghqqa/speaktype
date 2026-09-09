/**
 * 流式字幕的启用判定与终稿兜底语义。纯逻辑无 Electron 依赖，供 asr.ts 调用并直接单测。
 */

export interface StreamingDecision {
  /** 设置开关（settings.streamingCaptions） */
  enabled: boolean;
  /** 流式模型文件已就绪（字节数校验通过） */
  modelReady: boolean;
  /** 流式 worker 存活且模型加载完成（上一 session 未因崩溃降级） */
  workerHealthy: boolean;
  /** 调用方提供了字幕回调（onPartial）：没有消费者的流式没有意义 */
  hasPartialSink: boolean;
}

/**
 * 是否用流式模型出草稿字幕。与终稿模型类型无关——FireRed 终稿也要有字幕，
 * 这正是字幕层独立于终稿层的价值。开关/模型/worker 任一不满足即回退现有滑窗路径。
 */
export function shouldUseStreamingCaptions(d: StreamingDecision): boolean {
  return d.enabled && d.modelReady && d.workerHealthy && d.hasPartialSink;
}

export type FinalOutcome =
  | { ok: true; text: string }
  | { ok: false; error: unknown };

/**
 * 松手后的落字来源：终稿成功一律用终稿（质量管线在它后面）；终稿失败且流式草稿
 * 非空时用草稿兜底（有字好过没字）；都失败则原样失败，由现有错误路径处理。
 */
export function resolveCaptionFallback(final: FinalOutcome, streamingText: string | null): FinalOutcome {
  if (final.ok) return final;
  const draft = streamingText?.trim();
  if (draft) return { ok: true, text: draft };
  return final;
}
