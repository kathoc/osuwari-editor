import { applyMemoToDoc, type ApplyResult } from "../applyMemo";
import type { AIAdapter } from "./types";
import { buildMemoDraftPrompt, parseMemoDraftJson } from "./memoDraft";

export interface OllamaConfig {
  baseUrl?: string;
  model: string;
}

const PROXY = "/api/ai/ollama";

async function generate(prompt: string, cfg: OllamaConfig): Promise<string> {
  const r = await fetch(PROXY + "/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, model: cfg.model, baseUrl: cfg.baseUrl }),
  });
  if (!r.ok) throw new Error("ollama " + r.status);
  const data = await r.json();
  return String(data.text || "").trim();
}

export function makeOllamaAdapter(cfg: OllamaConfig): AIAdapter {
  return {
    id: "ollama",
    name: `Ollama (${cfg.model || "?"})`,
    async isAvailable() {
      try {
        const url = PROXY + "/health" + (cfg.baseUrl ? "?baseUrl=" + encodeURIComponent(cfg.baseUrl) : "");
        const r = await fetch(url);
        return r.ok;
      } catch {
        return false;
      }
    },

    async generateFromMemo({ memo, content, docId }) {
      // 1) 位置決定はローカルルールに任せる（mock placement）
      const placement = applyMemoToDoc(memo, content, docId);
      // 2) LLM に生成テキストだけ問い合わせ
      try {
        const prompt = buildMemoPrompt(memo, content, placement.applied.mode);
        const raw = await generate(prompt, cfg);
        const cleaned = cleanLLMOutput(raw);
        if (!cleaned) return placement;
        return replaceInserted(placement, cleaned, docId);
      } catch (e) {
        // 接続失敗時はローカル結果をそのまま返す
        return placement;
      }
    },

    async rewrite({ text, instruction, constraint, context }) {
      const maxChars =
        constraint?.maxChars ??
        (constraint?.widthChars && constraint?.maxLines ? constraint.widthChars * constraint.maxLines : null);
      const cBlock = maxChars ? `\n# 制約\n- 全体で${maxChars}文字以内` : "";
      const ctxBlock = context ? `\n# 周辺本文\n${context.slice(-600)}\n` : "";
      const prompt =
        `あなたは日本語の原稿編集アシスタントです。\n` +
        `次の文の文意・事実・固有名詞・主張を完全に維持したまま、指示の範囲だけを書き換えてください。\n` +
        `指示が明示的に意味の変更を求めていない場合、形容や評価語を別の意味の語へ置き換えないこと。\n` +
        `（例: 「面白い」を「かわいい」「楽しい」等の同義でない語へ置換しない。事実関係も変更しない）\n` +
        `語尾調整・語順整理・冗長削減など、意味を保てる範囲の編集に留めてください。\n` +
        `前置き・見出し・解説・コードブロックは不要。書き換え後の本文だけを出力してください。${cBlock}\n\n` +
        `# 元の文\n${text}\n${ctxBlock}\n# 指示\n${instruction}\n\n# 書き換え後`;
      try {
        const raw = await generate(prompt, cfg);
        const cleaned = cleanLLMOutput(raw);
        return cleaned || text;
      } catch {
        return text;
      }
    },

    async generateRuby({ sentence }) {
      if (!/[㐀-鿿]/.test(sentence)) return [];
      const prompt =
        `あなたは日本語のルビ振り器です。次の入力文に含まれる「漢字を含む語」を、文中に現れた順に` +
        `1つも漏らさず列挙し、その読みをひらがなで返してください。\n` +
        `重要ルール:\n` +
        `- 単漢字(例: 森・夜)、熟語(例: 約束・月明・固有名詞)、送り仮名のある語(例: 振り仮名・照らされ・小さな) すべて対象。\n` +
        `- base には漢字＋必要な送り仮名を含めてよい(例: "深い"→"ふかい"、"照らさ"→"てらさ")。\n` +
        `- 漢字が連続する熟語の読みは、モノルビとして 1 字ずつの読みの間に半角スペースを入れる(例: "伝言"→"でん ごん"、"大根"→"だい こん"、"約束"→"やく そく")。\n` +
        `- 送り仮名がある語は、漢字部分の読みのあとに半角スペースを入れず、送り仮名は kana 末尾にひらがなで続ける(例: "深い"→"ふかい"、"小さな"→"ちいさな")。\n` +
        `- 文中の同じ語が複数回出てきても、各出現ごとに 1 件ずつ列挙する。\n` +
        `- base は必ず漢字を 1 文字以上含む。ひらがな/カタカナのみの語は出さない。\n` +
        `- 読みが不確かな語は出さない(推測しない)。\n` +
        `- 出力は JSON 配列のみ。前置き・解説・コードフェンス・末尾の文字を絶対に付けない。\n` +
        `- 各要素は {"base":"<漢字を含む語>","kana":"<ひらがな読み>"}。\n\n` +
        `例:\n` +
        `入力: 深い森の奥、月明かりに照らされた小さな村がありました。\n` +
        `出力: [{"base":"深い","kana":"ふかい"},{"base":"森","kana":"もり"},{"base":"奥","kana":"おく"},{"base":"月明","kana":"つき あ"},{"base":"照らされ","kana":"てらされ"},{"base":"小さな","kana":"ちいさな"},{"base":"村","kana":"むら"}]\n\n` +
        `入力: ${sentence}\n` +
        `出力:`;
      try {
        const raw = await generate(prompt, cfg);
        const parsed = parseRubyJson(raw);
        if (parsed.length === 0 && raw) {
          // 互換: "森:もり" や "森 もり" 形式の行ベース出力も拾う
          const lineParsed = parseLineBasedRuby(raw);
          if (lineParsed.length > 0) return lineParsed;
        }
        return parsed;
      } catch {
        return [];
      }
    },

    async expandMemoDraft(req) {
      const prompt = buildMemoDraftPrompt(req);
      const raw = await generate(prompt, cfg);
      return parseMemoDraftJson(raw);
    },

    async chat({ instruction, context }) {
      const prompt =
        `あなたは日本語の原稿編集アシスタントです。次の本文を踏まえ、指示に答えてください。\n` +
        `本文は書き換えず、提案文だけを返してください。\n\n` +
        `# 本文\n${context}\n\n# 指示\n${instruction}\n\n# 提案`;
      return await generate(prompt, cfg);
    },
  };
}

function buildMemoPrompt(memo: string, content: string, mode: ApplyResult["applied"]["mode"]): string {
  const tail = content.slice(-1200);
  const action =
    mode === "replace"
      ? "本文中の該当段落を、メモの意図を反映した形に書き換えた段落"
      : mode === "append"
      ? "メモの内容を本文の該当段落の末尾に付け足すような、続きの1〜2文"
      : "本文の末尾に追加する、メモの内容を反映した1〜3文の段落";
  return (
    `あなたは日本語の原稿編集アシスタントです。\n` +
    `次の本文の文体・敬体/常体を維持したまま、${action}だけを出力してください。\n` +
    `前置き・見出し・コードブロック・解説は不要。原稿本文のテキストのみを返してください。\n\n` +
    `# 本文（末尾1200字）\n${tail}\n\n# メモ\n${memo}\n\n# 出力`
  );
}

function toHira(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCharCode(c - 0x60) : ch;
  }
  return out;
}

function parseRubyJson(raw: string): Array<{ base: string; kana: string }> {
  if (!raw) return [];
  let s = raw.trim();
  // ```json ... ``` などのコードブロック除去
  s = s.replace(/```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // 最初の [ から最後の ] までを切り出す
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a === -1 || b === -1 || b <= a) return [];
  const slice = s.slice(a, b + 1);
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: Array<{ base: string; kana: string }> = [];
    for (const item of parsed) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const base = typeof o.base === "string" ? o.base : typeof o.word === "string" ? (o.word as string) : "";
        const kana = typeof o.kana === "string" ? o.kana : typeof o.reading === "string" ? (o.reading as string) : "";
        if (base && kana && /[㐀-鿿]/.test(base)) out.push({ base, kana: toHira(kana) });
      }
    }
    return out;
  } catch {
    return [];
  }
}

// 行単位の "漢字:よみ" / "漢字 よみ" 形式を抽出（LLM が JSON を守れなかった時の救済）
function parseLineBasedRuby(raw: string): Array<{ base: string; kana: string }> {
  const out: Array<{ base: string; kana: string }> = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim().replace(/^[-*・\d.)]+\s*/, "");
    if (!t) continue;
    const m =
      t.match(/^([^\s:：()（）「」『』]+)\s*[:：→\->]\s*([ぁ-ゖァ-ヶー]+)/) ||
      t.match(/^([^\s:：()（）「」『』]+)\s*\(([ぁ-ゖァ-ヶー]+)\)/) ||
      t.match(/^([^\s:：()（）「」『』]+)\s+([ぁ-ゖァ-ヶー]+)$/);
    if (!m) continue;
    const base = m[1].trim();
    const kana = m[2].trim();
    if (base && kana && /[㐀-鿿]/.test(base)) out.push({ base, kana: toHira(kana) });
  }
  return out;
}

function cleanLLMOutput(s: string): string {
  return s
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .replace(/^「|」$/g, "")
    .trim();
}

// 位置はそのままに、挿入テキストだけ LLM 生成に差し替える
function replaceInserted(base: ApplyResult, newInserted: string, docId: string): ApplyResult {
  const { range } = base.applied;
  const newContent = base.newContent.slice(0, range.start) + newInserted + base.newContent.slice(range.end);
  return {
    newContent,
    applied: {
      docId,
      mode: base.applied.mode,
      inserted: newInserted,
      range: { start: range.start, end: range.start + newInserted.length },
    },
  };
}
