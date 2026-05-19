import type { MorphAnalyzer, MorphToken } from "../types.js";
import { katakanaToHiragana, normalizeReading } from "../normalize.js";

/**
 * Deterministic mock analyzer used in tests. Tokenizes by a fixed lexicon
 * with first-longest match, falling back to single-character tokens.
 *
 * The lexicon is intentionally minimal — exact readings here are *not* used as
 * authoritative ruby; downstream user/project/ambiguous-readings dictionaries
 * override anyway. The point is to provide stable POS/segmentation in tests.
 */
const LEXICON: Array<{ surface: string; reading: string; pos: string[] }> = [
  { surface: "今日", reading: "きょう", pos: ["名詞", "副詞可能"] },
  { surface: "午後", reading: "ごご", pos: ["名詞"] },
  { surface: "村人ゾンビ", reading: "むらびとぞんび", pos: ["名詞", "固有名詞"] },
  { surface: "村人", reading: "むらびと", pos: ["名詞"] },
  { surface: "観察", reading: "かんさつ", pos: ["名詞", "サ変接続"] },
  { surface: "社会", reading: "しゃかい", pos: ["名詞"] },
  { surface: "人気", reading: "にんき", pos: ["名詞"] },
  { surface: "洞窟", reading: "どうくつ", pos: ["名詞"] },
  { surface: "生物", reading: "せいぶつ", pos: ["名詞"] },
  { surface: "傷ま", reading: "いたま", pos: ["動詞"] },
  { surface: "保存", reading: "ほぞん", pos: ["名詞", "サ変接続"] },
  { surface: "一日", reading: "いちにち", pos: ["名詞"] },
  { surface: "五月", reading: "ごがつ", pos: ["名詞"] },
  { surface: "日照", reading: "にっしょう", pos: ["名詞"] },
  { surface: "センサー", reading: "せんさー", pos: ["名詞"] },
  { surface: "街灯", reading: "がいとう", pos: ["名詞"] },
  { surface: "自動", reading: "じどう", pos: ["名詞"] },
  { surface: "化", reading: "か", pos: ["接尾"] },
  { surface: "司書", reading: "ししょ", pos: ["名詞"] },
  { surface: "取引", reading: "とりひき", pos: ["名詞"] },
  { surface: "マイクラ", reading: "まいくら", pos: ["名詞", "固有名詞"] },
  { surface: "建築", reading: "けんちく", pos: ["名詞"] },
  { surface: "AI", reading: "えーあい", pos: ["名詞"] },
  { surface: "イベント", reading: "いべんと", pos: ["名詞"] },
  { surface: "素早く", reading: "すばやく", pos: ["副詞"] },
  { surface: "確認", reading: "かくにん", pos: ["名詞", "サ変接続"] },
  { surface: "食べる", reading: "たべる", pos: ["動詞"] },
  { surface: "成り立ち", reading: "なりたち", pos: ["名詞"] },
  { surface: "欠かせない", reading: "かかせない", pos: ["形容詞"] },
  { surface: "電気", reading: "でんき", pos: ["名詞"] },
];

// Stable order: longest-first so 村人ゾンビ matches before 村人.
LEXICON.sort((a, b) => b.surface.length - a.surface.length);

const PARTICLES: Record<string, string[]> = {
  "の": ["助詞", "連体化"],
  "が": ["助詞", "格助詞"],
  "を": ["助詞", "格助詞"],
  "に": ["助詞", "格助詞"],
  "は": ["助詞", "係助詞"],
  "で": ["助詞", "格助詞"],
  "と": ["助詞", "格助詞"],
  "や": ["助詞", "並立"],
  "も": ["助詞", "係助詞"],
};

const SYMBOLS = new Set(["、", "。", "！", "？", "「", "」", "・", "ー", " ", "\t"]);

export class MockAnalyzer implements MorphAnalyzer {
  readonly name = "MockAnalyzer";
  readonly version = "0.1.0";

  async analyze(text: string): Promise<MorphToken[]> {
    const tokens: MorphToken[] = [];
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (SYMBOLS.has(ch)) {
        tokens.push({ surface: ch, reading: ch, lemma: ch, pos: ["記号"], start: i, end: i + 1, isUnknown: false });
        i += 1;
        continue;
      }
      if (ch in PARTICLES) {
        tokens.push({ surface: ch, reading: ch, lemma: ch, pos: PARTICLES[ch], start: i, end: i + 1, isUnknown: false });
        i += 1;
        continue;
      }
      let matched: { surface: string; reading: string; pos: string[] } | null = null;
      for (const entry of LEXICON) {
        if (text.startsWith(entry.surface, i)) {
          matched = entry;
          break;
        }
      }
      if (matched) {
        tokens.push({
          surface: matched.surface,
          reading: normalizeReading(matched.reading),
          lemma: matched.surface,
          pos: matched.pos,
          start: i,
          end: i + matched.surface.length,
          isUnknown: false,
        });
        i += matched.surface.length;
        continue;
      }
      // Fallback: single character as unknown.
      tokens.push({
        surface: ch,
        reading: katakanaToHiragana(ch),
        lemma: ch,
        pos: ["名詞", "一般"],
        start: i,
        end: i + 1,
        isUnknown: true,
      });
      i += 1;
    }
    return tokens;
  }
}
