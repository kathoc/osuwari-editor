import type { Highlight, Mode } from "./types";

// 50文字未満ではハイライト出さない
const MIN_LEN = 50;

// ルビ記法（｜漢字《かんじ》 または 漢字《かんじ》）
const RUBY_RE = /(?:｜([^｜《》\n]+)《([^《》\n]+)》)|((?:[\p{Script=Han}A-Za-z]+))《([^《》\n]+)》/gu;

export function findRuby(text: string): Highlight[] {
  const out: Highlight[] = [];
  let m: RegExpExecArray | null;
  RUBY_RE.lastIndex = 0;
  while ((m = RUBY_RE.exec(text))) {
    const base = m[1] || m[3] || "";
    const ruby = m[2] || m[4] || "";
    if (!base || !ruby) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "ruby",
      message: `${base} → ${ruby}`,
    });
  }
  return out;
}

export interface RubySegment {
  start: number; // 本文中の絶対位置
  end: number;
  base: string;
  ruby: string;
}

export interface RubyReading {
  start: number; // base 開始位置
  end: number;   // base 終了位置（送り仮名は含めない）
  kana: string;  // ひらがなの読み
  manual: boolean; // 既存マークアップ由来か
  // モノルビ分割の対応。存在する場合は描画側で各 segment を個別の <ruby> として描画する。
  segments?: RubySegment[];
  // v2 ruby-engine metadata (optional; present on auto readings only)
  source?:
    | "dictionary"
    | "rule"
    | "context_rule"
    | "user_dictionary"
    | "ai"
    | "manual"
    | "unknown";
  confidence?: number;
  reason?: string;
  flags?: string[];
  rubyMode?: "mono" | "group" | "jukugo" | "unknown";
  candidates?: string[];
}

export interface RubyReviewItem {
  start: number;
  end: number;
  base: string;
  context: string;
  candidates: string[];
  reason: string;
}

// 既存マークアップから base のレンジと読みを抽出
export function findManualReadings(text: string): RubyReading[] {
  const out: RubyReading[] = [];
  let m: RegExpExecArray | null;
  RUBY_RE.lastIndex = 0;
  while ((m = RUBY_RE.exec(text))) {
    // m[1]/m[2] = ｜base《ruby》、m[3]/m[4] = base《ruby》（先頭｜なし）
    if (m[1] && m[2]) {
      const baseStart = m.index + 1; // ｜の次から
      out.push({
        start: baseStart,
        end: baseStart + m[1].length,
        kana: m[2],
        manual: true,
      });
    } else if (m[3] && m[4]) {
      out.push({
        start: m.index,
        end: m.index + m[3].length,
        kana: m[4],
        manual: true,
      });
    }
  }
  return out;
}

export function analyze(text: string, mode: Mode): Highlight[] {
  // ルビは常に検出（短文でも）
  const ruby = findRuby(text);
  if (text.length < MIN_LEN) return ruby;
  const out: Highlight[] = [...ruby];

  // 1) 句読点重複: 、、 。。 ,, .. !! ??
  const punctRe = /([、。,.!?！？])\1+/g;
  let m: RegExpExecArray | null;
  while ((m = punctRe.exec(text))) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "punct-dup",
      message: "句読点が連続しています",
      suggestion: `「${m[0]}」→「${m[1]}」に直しましょう`,
    });
  }

  // 2) 語尾連続: 「〜です。」「〜ます。」が3回以上連続
  const endings = ["です", "ます", "した", "だった"];
  const endingAlt: Record<string, string[]> = {
    "です": ["〜だと考えます", "〜なのです", "〜でしょう", "体言止め"],
    "ます": ["〜してみてください", "〜することになります", "〜しています"],
    "した": ["〜だったのです", "〜したのでした", "〜していました"],
    "だった": ["〜であった", "〜だったのだ", "〜だったらしい"],
  };
  const sentences: { start: number; end: number; text: string }[] = [];
  {
    let s = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "。" || ch === "．" || ch === "\n") {
        sentences.push({ start: s, end: i + 1, text: text.slice(s, i + 1) });
        s = i + 1;
      }
    }
    if (s < text.length) sentences.push({ start: s, end: text.length, text: text.slice(s) });
  }
  for (const end of endings) {
    let run: typeof sentences = [];
    for (const sen of sentences) {
      if (sen.text.includes(end + "。") || sen.text.trimEnd().endsWith(end)) {
        run.push(sen);
        if (run.length >= 3) {
          const alts = endingAlt[end] ?? [];
          const sg = alts.length
            ? `語尾を変えてみましょう。例: ${alts.map((s) => `「${s}」`).join("／")}`
            : "語尾を別の表現に言い換えてみましょう";
          for (const r of run) {
            out.push({
              start: r.start,
              end: r.end,
              kind: "ending-streak",
              message: `語尾「${end}」が連続しています`,
              suggestion: sg,
            });
          }
        }
      } else {
        run = [];
      }
    }
  }

  // 3) 同一語連続: 同じ2文字以上の語が10文字以内に再出現
  const wordRe = /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]{2,})/gu;
  const seen: { word: string; index: number }[] = [];
  let wm: RegExpExecArray | null;
  while ((wm = wordRe.exec(text))) {
    const word = wm[1];
    const idx = wm.index;
    for (const s of seen) {
      if (s.word === word && idx - (s.index + s.word.length) <= 10 && idx !== s.index) {
        out.push({
          start: idx,
          end: idx + word.length,
          kind: "word-streak",
          message: `「${word}」が近接して重複`,
          suggestion: `指示語（それ／その／同じ）に置き換える、類義語に言い換える、文を一つにまとめるなどで重複を避けられます`,
        });
      }
    }
    seen.push({ word, index: idx });
    if (seen.length > 200) seen.shift();
  }

  // 草稿モードは件数を間引く（緩く）
  if (mode === "draft") {
    return dedupRanges(out).filter((_, i) => i % 2 === 0);
  }
  return dedupRanges(out);
}

function dedupRanges(arr: Highlight[]): Highlight[] {
  const key = (h: Highlight) => `${h.start}:${h.end}:${h.kind}`;
  const map = new Map<string, Highlight>();
  for (const h of arr) map.set(key(h), h);
  return [...map.values()].sort((a, b) => a.start - b.start);
}

// 現在カーソルが含まれる段落の範囲
export function currentParagraph(text: string, cursor: number): { start: number; end: number; text: string } {
  let start = text.lastIndexOf("\n", Math.max(0, cursor - 1));
  start = start === -1 ? 0 : start + 1;
  let end = text.indexOf("\n", cursor);
  if (end === -1) end = text.length;
  return { start, end, text: text.slice(start, end) };
}
