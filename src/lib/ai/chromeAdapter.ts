// Chrome Built-in AI (Prompt API / Gemini Nano) adapter
// 仕様参考: https://developer.chrome.com/docs/ai/prompt-api
//
// 利用条件: Chrome デスクトップ + Prompt API 有効化 + Gemini Nano DL 済み。
// availability() で "available" / "downloadable" / "downloading" / "unavailable" を返す。
// 本アダプタは "available" の場合のみ生成、それ以外は false / 元テキストを返す。

import { applyMemoToDoc, type ApplyResult } from "../applyMemo";
import type { AIAdapter } from "./types";
import { buildMemoDraftPrompt, parseMemoDraftJson } from "./memoDraft";

declare global {
  interface Window {
    LanguageModel?: ChromeLanguageModelStatic;
    ai?: { languageModel?: ChromeLanguageModelStatic };
  }
}

interface ChromeLanguageModelStatic {
  availability?: () => Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  capabilities?: () => Promise<{ available?: string }>;
  create: (opts?: { initialPrompts?: Array<{ role: string; content: string }>; temperature?: number; topK?: number }) => Promise<ChromeLanguageModelSession>;
}

interface ChromeLanguageModelSession {
  prompt: (input: string) => Promise<string>;
  destroy?: () => void;
}

function getLM(): ChromeLanguageModelStatic | null {
  if (typeof window === "undefined") return null;
  return window.LanguageModel || window.ai?.languageModel || null;
}

async function checkAvailable(): Promise<boolean> {
  const lm = getLM();
  if (!lm) return false;
  try {
    if (typeof lm.availability === "function") {
      const s = await lm.availability();
      return s === "available";
    }
    if (typeof lm.capabilities === "function") {
      const c = await lm.capabilities();
      return c?.available === "readily";
    }
  } catch {}
  return false;
}

async function prompt(text: string): Promise<string> {
  const lm = getLM();
  if (!lm) throw new Error("Chrome AI not available");
  const session = await lm.create({ temperature: 0.7, topK: 3 });
  try {
    const out = await session.prompt(text);
    return out;
  } finally {
    session.destroy?.();
  }
}

function clean(s: string): string {
  return s.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").replace(/^「|」$/g, "").trim();
}

export const chromeAdapter: AIAdapter = {
  id: "chrome",
  name: "Chrome (Gemini Nano)",
  async isAvailable() {
    return await checkAvailable();
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
      const raw = clean(await prompt(p));
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
    const maxChars = constraint?.maxChars ?? (constraint?.widthChars && constraint?.maxLines ? constraint.widthChars * constraint.maxLines : null);
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
      return clean(await prompt(p)) || text;
    } catch {
      return text;
    }
  },

  async expandMemoDraft(req) {
    const p = buildMemoDraftPrompt(req);
    const raw = await prompt(p);
    return parseMemoDraftJson(raw);
  },

  async chat({ instruction, context }) {
    const p =
      `あなたは日本語の原稿編集アシスタントです。次の本文を踏まえ、指示に答えてください。\n` +
      `本文は書き換えず、提案文だけを返してください。\n\n` +
      `# 本文\n${context}\n\n# 指示\n${instruction}\n\n# 提案`;
    try {
      return await prompt(p);
    } catch (e) {
      return "（Chrome AI 応答失敗）";
    }
  },
};
