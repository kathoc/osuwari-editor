// ローカルAI(オンデバイス) アダプタ
// @electron/llm 経由で同梱モデルを呼び出す。モデルファイルは
// userData/models/<alias> に置かれ、未導入時は isAvailable() が false。

import { applyMemoToDoc, type ApplyResult } from "../applyMemo";
import type { AIAdapter } from "./types";
import { buildMemoDraftPrompt, parseMemoDraftJson } from "./memoDraft";
import {
  ensureLocalLlmReady,
  getLocalLlmBridge,
  hasLocalLlmBridge,
  promptLocalLlm,
} from "./localLlm";

function clean(s: string): string {
  return s
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .replace(/^「|」$/g, "")
    .trim();
}

async function safePrompt(text: string, timeoutMs = 90000): Promise<string> {
  const ok = await ensureLocalLlmReady();
  if (!ok) throw new Error("local-llm not ready");
  return await promptLocalLlm(text, timeoutMs);
}

export const localLlmAdapter: AIAdapter = {
  id: "local-llm",
  name: "ローカルAI(オンデバイス)",

  async isAvailable() {
    if (!hasLocalLlmBridge()) return false;
    const bridge = getLocalLlmBridge();
    if (!bridge) return false;
    try {
      const s = await bridge.status();
      return s.installed && !s.downloading;
    } catch {
      return false;
    }
  },

  async generateFromMemo({ memo, content, docId }) {
    const placement = applyMemoToDoc(memo, content, docId);
    try {
      const mode = placement.applied.mode;
      const action =
        mode === "replace"
          ? "本文中の該当段落を、メモの意図を反映した形に書き換えた段落"
          : mode === "append"
          ? "メモの内容を本文の該当段落の末尾に付け足すような、続きの1〜2文"
          : "本文の末尾に追加する、メモの内容を反映した1〜3文の段落";
      const p =
        `あなたは日本語の原稿編集アシスタントです。\n` +
        `次の本文の文体・敬体/常体を維持したまま、${action}だけを出力してください。\n` +
        `前置き・見出し・コードブロック・解説は不要。原稿本文のテキストのみを返してください。\n\n` +
        `# 本文（末尾1200字）\n${content.slice(-1200)}\n\n# メモ\n${memo}\n\n# 出力`;
      const raw = clean(await safePrompt(p));
      if (!raw) return placement;
      const { range } = placement.applied;
      return {
        newContent: placement.newContent.slice(0, range.start) + raw + placement.newContent.slice(range.end),
        applied: { docId, mode, inserted: raw, range: { start: range.start, end: range.start + raw.length } },
      } as ApplyResult;
    } catch {
      return placement;
    }
  },

  async rewrite({ text, instruction, constraint, context }) {
    const maxChars =
      constraint?.maxChars ??
      (constraint?.widthChars && constraint?.maxLines ? constraint.widthChars * constraint.maxLines : null);
    const cBlock = maxChars ? `\n# 制約\n- 全体で${maxChars}文字以内` : "";
    const ctxBlock = context ? `\n# 周辺本文\n${context.slice(-600)}\n` : "";
    const isGeneration = !text || text.trim().length === 0;
    const p = isGeneration
      ? `あなたは日本語の原稿執筆アシスタントです。\n` +
        `次の指示に従い、原稿本文だけを出力してください。前置き・見出し・解説は不要です。${cBlock}\n${ctxBlock}\n# 指示\n${instruction}\n\n# 出力`
      : `あなたは日本語の原稿編集アシスタントです。\n` +
        `次の文の文意・事実・固有名詞・主張を完全に維持したまま、指示の範囲だけを書き換えてください。\n` +
        `前置き・見出し・コードブロックは不要。書き換え後の本文だけを出力してください。${cBlock}\n\n` +
        `# 元の文\n${text}\n${ctxBlock}\n# 指示\n${instruction}\n\n# 書き換え後`;
    try {
      return clean(await safePrompt(p)) || text;
    } catch {
      return text;
    }
  },

  async expandMemoDraft(req) {
    const p = buildMemoDraftPrompt(req);
    const raw = await safePrompt(p);
    return parseMemoDraftJson(raw);
  },

  async chat({ instruction, context }) {
    const p =
      `あなたは日本語の原稿編集アシスタントです。次の本文を踏まえ、指示に答えてください。\n` +
      `本文は書き換えず、提案文だけを返してください。\n\n` +
      `# 本文\n${context}\n\n# 指示\n${instruction}\n\n# 提案`;
    try {
      return await safePrompt(p);
    } catch {
      return "（ローカルAI 応答失敗）";
    }
  },
};
