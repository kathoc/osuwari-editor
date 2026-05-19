export interface NormalizedText {
  text: string;
  // offsetMap[i] = original offset corresponding to normalized offset i
  offsetMap: number[];
}

export interface NormalizeOptions {
  // Default: NFKC. If false, only minimal normalization is applied.
  unicodeNFKC?: boolean;
}

/**
 * Normalize text while preserving a per-character map back to original offsets.
 * The map has length text.length + 1 (so end positions also resolve).
 */
export function normalizeText(input: string, opts: NormalizeOptions = {}): NormalizedText {
  const useNFKC = opts.unicodeNFKC !== false;
  const out: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const normalized = useNFKC ? ch.normalize("NFKC") : ch;
    for (let k = 0; k < normalized.length; k++) {
      out.push(normalized[k]);
      map.push(i);
    }
  }
  map.push(input.length);
  return { text: out.join(""), offsetMap: map };
}

export function mapNormalizedRange(n: NormalizedText, start: number, end: number): { start: number; end: number } {
  return { start: n.offsetMap[start] ?? 0, end: n.offsetMap[end] ?? n.offsetMap[n.offsetMap.length - 1] };
}

const KATA_TO_HIRA_OFFSET = "ぁ".charCodeAt(0) - "ァ".charCodeAt(0);
export function katakanaToHiragana(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCharCode(code + KATA_TO_HIRA_OFFSET);
    } else if (ch === "ー") {
      out += "ー";
    } else {
      out += ch;
    }
  }
  return out;
}

const KANJI_RE = /[㐀-鿿豈-﫿]/;
export function isKanji(ch: string): boolean {
  return KANJI_RE.test(ch);
}

export function hasKanji(s: string): boolean {
  for (const ch of s) if (isKanji(ch)) return true;
  return false;
}

const HIRA_RE = /^[ぁ-ゖー]+$/;
export function isAllHiragana(s: string): boolean {
  return HIRA_RE.test(s);
}

export function isHiragana(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 0x3041 && c <= 0x3096;
}

/**
 * Find the length (in characters) of the leading kanji-only prefix of `surface`
 * such that the rest is pure hiragana okurigana. Returns 0 if there is no such
 * split (e.g. mixed kanji-kana-kanji like 「行き先」).
 *
 * 素早く → 2 (素早 + く)
 * 食べる → 1 (食 + べる)
 * 行き先 → 0 (kanji-kana-kanji is not a safe okurigana strip)
 * 観察    → 0 (no okurigana to strip)
 * きれい  → 0 (no kanji prefix)
 */
/**
 * Decompose surface into alternating kanji / kana blocks (in order).
 * Non-kanji-non-hiragana chars (katakana, punctuation, ASCII) abort and the
 * whole word is treated as a single opaque kanji-like block.
 */
export interface SurfaceBlock {
  kind: "kanji" | "kana";
  text: string;
  start: number; // char index in original surface
  end: number;
}
export function splitSurfaceBlocks(surface: string): SurfaceBlock[] | null {
  const chars = [...surface];
  const blocks: SurfaceBlock[] = [];
  let curKind: "kanji" | "kana" | null = null;
  let curText = "";
  let curStart = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    let kind: "kanji" | "kana" | null;
    if (isKanji(ch)) kind = "kanji";
    else if (isHiragana(ch)) kind = "kana";
    else return null;
    if (kind !== curKind) {
      if (curText) blocks.push({ kind: curKind!, text: curText, start: curStart, end: i });
      curText = ch;
      curKind = kind;
      curStart = i;
    } else {
      curText += ch;
    }
  }
  if (curText) blocks.push({ kind: curKind!, text: curText, start: curStart, end: chars.length });
  return blocks;
}

export function findOkuriganaSplit(surface: string): number {
  const chars = [...surface];
  let i = 0;
  while (i < chars.length && isKanji(chars[i])) i++;
  if (i === 0 || i === chars.length) return 0;
  for (let j = i; j < chars.length; j++) {
    if (!isHiragana(chars[j])) return 0;
  }
  return i;
}

/**
 * Normalize pronunciation-style readings to writing-style readings.
 *  - 長音 ー → vowel based on previous mora (エーガ → エイガ)
 */
export function normalizeReading(raw: string): string {
  if (!raw) return raw;
  const hira = katakanaToHiragana(raw);
  let out = "";
  const vowelMap: Record<string, string> = {
    あいうえお: "あいうえお",
  };
  // map each kana to its vowel
  const kanaVowel: Record<string, string> = {
    "あ":"あ","い":"い","う":"う","え":"え","お":"お",
    "か":"あ","き":"い","く":"う","け":"え","こ":"お",
    "が":"あ","ぎ":"い","ぐ":"う","げ":"え","ご":"お",
    "さ":"あ","し":"い","す":"う","せ":"え","そ":"お",
    "ざ":"あ","じ":"い","ず":"う","ぜ":"え","ぞ":"お",
    "た":"あ","ち":"い","つ":"う","て":"え","と":"お",
    "だ":"あ","ぢ":"い","づ":"う","で":"え","ど":"お",
    "な":"あ","に":"い","ぬ":"う","ね":"え","の":"お",
    "は":"あ","ひ":"い","ふ":"う","へ":"え","ほ":"お",
    "ば":"あ","び":"い","ぶ":"う","べ":"え","ぼ":"お",
    "ぱ":"あ","ぴ":"い","ぷ":"う","ぺ":"え","ぽ":"お",
    "ま":"あ","み":"い","む":"う","め":"え","も":"お",
    "や":"あ","ゆ":"う","よ":"お",
    "ら":"あ","り":"い","る":"う","れ":"え","ろ":"お",
    "わ":"あ","を":"お","ん":"",
    "ゃ":"あ","ゅ":"う","ょ":"お",
  };
  // For 長音 in publishing-style writing: え→い after え-row (えー→えい),
  // お→う after お-row (おー→おう). Others map to same vowel.
  for (let i = 0; i < hira.length; i++) {
    const ch = hira[i];
    if (ch === "ー" && out.length > 0) {
      const prev = out[out.length - 1];
      const v = kanaVowel[prev];
      if (v === "え") out += "い";
      else if (v === "お") out += "う";
      else if (v) out += v;
      else out += "ー";
    } else {
      out += ch;
    }
  }
  return out;
}
