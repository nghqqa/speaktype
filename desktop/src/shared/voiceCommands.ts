/**
 * 免按语音命令词表（默认关）：整条 finalize 去尾标点后逐词匹配（长词容一字误识）才触发，
 * 嵌入句中照常落字。仅启用已实测 ASR 输出稳定的 zh/en 词表。
 * 纯文本逻辑无 electron 依赖，供主进程 dictation 使用并直接单测。
 */
export type VoiceCommand = "newline" | "paragraph" | "deleteLast";

export const VOICE_COMMANDS: ReadonlyArray<{ cmd: VoiceCommand; words: readonly string[] }> = [
  { cmd: "newline", words: ["换行", "換行", "new line", "newline", "line break"] },
  { cmd: "paragraph", words: ["另起一段", "new paragraph"] },
  { cmd: "deleteLast", words: ["删除上一句", "刪除上一句", "delete last sentence"] },
];

// ASR 误识别容错：≥4 字的命令词允许同长度单字之差（如「删除上一去」→「删除上一句」）；
// 短词（换行等）保持精确匹配，避免把普通两字词误当命令
const FUZZY_MIN_LEN = 4;

function nearMatch(input: string, word: string): boolean {
  if (input === word) return true;
  if (word.length < FUZZY_MIN_LEN || input.length !== word.length) return false;
  let diff = 0;
  for (let i = 0; i < word.length; i++) {
    if (input[i] !== word[i] && ++diff > 1) return false;
  }
  return diff === 1;
}

function matchVoiceCommand(part: string): VoiceCommand | null {
  const normalized = part.trim().replace(/[。．.!?！？，,\s]+$/u, "").toLowerCase();
  if (!normalized) return null;
  for (const { cmd, words } of VOICE_COMMANDS) {
    for (const word of words) if (nearMatch(normalized, word)) return cmd;
  }
  return null;
}

/** 整条文本全部由命令词组成才算命令（按句号切分逐段匹配），否则视为普通听写 */
export function parseVoiceCommands(text: string): VoiceCommand[] | null {
  const parts = text.split(/[。．.!?！？]/u).filter((p) => p.trim().length > 0);
  if (parts.length === 0) return null;
  const cmds: VoiceCommand[] = [];
  for (const part of parts) {
    const cmd = matchVoiceCommand(part);
    if (!cmd) return null;
    cmds.push(cmd);
  }
  return cmds;
}
