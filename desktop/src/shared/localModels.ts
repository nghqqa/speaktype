/** 本地离线模型清单：main 的推理/下载与 store 的导入校验共用同一份 id 白名单 */

/** SenseVoice 模型 id；localModel 等于它时走 sherpa-onnx 而不是 whisper-server */
export const SENSEVOICE = "sensevoice-small";

/**
 * FireRedASR v2 CTC（sherpa-onnx int8）：中英双语 + 20 余种中文方言（四川/天津/河南等），
 * 同硬件实测口语精度略高于 SenseVoice（TTS 难句 CER 约 2% vs 3%），代价是解码慢约 8 倍
 *（RTF 约 0.3：10 秒语音约 2 秒出字）、无实时字幕、输出无标点（由应用的补标点管线兜底）。
 */
export const FIRERED_CTC = "fire-red-asr2-ctc-zh-en-int8";

/** Parakeet TDT 0.6B v3（sherpa-onnx int8）：英语及 25 种欧洲语言，自动语种检测，不支持中文 */
export const PARAKEET = "parakeet-tdt-0.6b-v3";

/**
 * 流式字幕模型（sherpa-onnx streaming paraformer 中英双语 int8，三件套共约 238MB）。
 * 只服务录音中的草稿字幕（two-pass 的「看」半边），不参与落字终稿——
 * 因此刻意不进 LOCAL_MODELS：不得出现在转写模型下拉与 LOCAL_MODEL_IDS 校验里。
 * 模型选型（同类素材 A/B：TTS 专有名词句/混英句/四川话）：2023 双语 zipformer 中文
 * 病理性叠字（张江→张江江），否决；2025 中文 zipformer 中文零叠字但英文全乱；
 * paraformer 双语中文仅零星错字（张江→张将）且 report/email 等英文单词全对、
 * RTF 0.055 三者最快——草稿层的双语诉求与中文可读性兼得。
 */
export const STREAMING_CAPTIONS = "streaming-paraformer-zh-en";

/**
 * 同一 Parakeet 的 fp32 原精度版：int8 量化在个别首词（如 "Please"→"Ple"）处于判定边界会吞字
 *（离线 A/B：int8 15/99、fp32 0/99），fp32 消除该问题，代价是 2.5GB 下载、常驻内存约 2.7GB。
 */
export const PARAKEET_FP32 = "parakeet-tdt-0.6b-v3-fp32";

/** name 是面向用户的显示名（下拉项/提示里用），id 仍是配置与下载的唯一键 */
export const LOCAL_MODELS = [
  { id: SENSEVOICE, name: "SenseVoice Small", size: "234MB" },
  { id: FIRERED_CTC, name: "FireRedASR", size: "740MB" },
  { id: PARAKEET, name: "Parakeet", size: "660MB" },
  { id: PARAKEET_FP32, name: "Parakeet", size: "2.5GB" },
  { id: "tiny-q5_1", name: "Whisper tiny", size: "32MB" },
  { id: "base-q5_1", name: "Whisper base", size: "60MB" },
  { id: "small-q5_1", name: "Whisper small", size: "190MB" },
] as const;

/** 走 sherpa-onnx 进程内推理的模型（否则走 whisper-server 子进程） */
export function isSherpaModel(model: string): boolean {
  return model === SENSEVOICE || model === FIRERED_CTC || isParakeetModel(model);
}

/** FireRedASR v2 CTC：zh_en 双语模型，语言设置既不编进配置也不影响识别结果 */
export function isFireRedModel(model: string): boolean {
  return model === FIRERED_CTC;
}

/**
 * FireRedASR 词表的英文 token 是训练时归一的全大写（REPORT/EMAIL/CHECK），日常口述里
 * 观感突兀；终稿落字前把「整词全大写」的英文转小写，常见缩写（本来就该大写的）保留。
 * 边界：非白名单的品牌缩写（IBM/NASA）也会被转小写——模型对英文一律大写、无法区分
 * 用户本意，按「常见词小写 + 缩写白名单大写」取最优期望；白名单可按需增补。
 */
const ACRONYM_KEEP = new Set([
  "AI", "API", "APP", "CEO", "COO", "CTO", "CPU", "GPU", "GPS", "GPT", "HR", "ID", "IT", "KPI",
  "LLM", "OK", "OS", "PDF", "PPT", "PS", "QQ", "USB", "URL", "VIP", "VS",
]);

export function normalizeFireRedCaps(text: string): string {
  return text.replace(/[A-Z]{2,}/g, (w) => (ACRONYM_KEEP.has(w) ? w : w.toLowerCase()));
}

/** Parakeet 两个精度版本共享同一套语义：自带语种检测、不吃 language 设置、不识中文 */
export function isParakeetModel(model: string): boolean {
  return model === PARAKEET || model === PARAKEET_FP32;
}

/**
 * whisper 非 large-v3 模型（本清单里的 tiny/base/small 全是）n_langs=99，词表不含 yue；
 * whisper.cpp 仍接受 language=yue 并把 yue(id 99) 编成 sot+100，即 translate 任务 token，
 * 实测 base-q5_1 同一段中文音频 language=zh 出中文、language=yue 出英文译文。
 * 这里把 yue 降到 zh：粤语音频按中文解码，虽不能保留粤语用词，至少不会被翻成英文。
 */
export function whisperLanguage(language: string): string {
  return language === "yue" ? "zh" : language;
}

/** 该本地模型能否原生识别粤语（SenseVoice 支持，whisper 小模型不支持，Parakeet 不识中文） */
export function supportsCantonese(model: string): boolean {
  return model === SENSEVOICE;
}

export const LOCAL_MODEL_IDS: ReadonlyArray<string> = LOCAL_MODELS.map((m) => m.id);
