import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MorphAnalyzer, MorphToken } from "../types.js";
import { katakanaToHiragana, normalizeReading } from "../normalize.js";

interface KuromojiToken {
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  pos_detail_2: string;
  pos_detail_3: string;
  reading?: string;
  pronunciation?: string;
  basic_form?: string;
  word_position: number;
}

let tokenizerPromise: Promise<any> | null = null;

function resolveDicPath(): string {
  const require = createRequire(import.meta.url);
  // kuromoji ships its dictionary under dict/ relative to the package.
  const pkgJson = require.resolve("kuromoji/package.json");
  return path.join(path.dirname(pkgJson), "dict");
}

async function getTokenizer(dicPath?: string): Promise<any> {
  if (tokenizerPromise) return tokenizerPromise;
  const dir = dicPath ?? resolveDicPath();
  const require = createRequire(import.meta.url);
  const kuromoji = require("kuromoji");
  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: dir }).build((err: Error | null, t: any) => {
      if (err) reject(err);
      else resolve(t);
    });
  });
  return tokenizerPromise;
}

export class KuromojiAdapter implements MorphAnalyzer {
  readonly name = "KuromojiAdapter";
  readonly version = "0.1.2-ipadic";
  private dicPath?: string;

  constructor(dicPath?: string) {
    this.dicPath = dicPath;
  }

  async analyze(text: string): Promise<MorphToken[]> {
    const tokenizer = await getTokenizer(this.dicPath);
    const raw: KuromojiToken[] = tokenizer.tokenize(text);
    const tokens: MorphToken[] = [];
    for (const t of raw) {
      const start = t.word_position - 1;
      const end = start + t.surface_form.length;
      // Prefer the writing-style "reading" over "pronunciation" (which uses ー).
      const rawReading = t.reading ?? t.pronunciation ?? t.surface_form;
      const reading = normalizeReading(katakanaToHiragana(rawReading));
      const pos = [t.pos, t.pos_detail_1, t.pos_detail_2, t.pos_detail_3].filter((p) => p && p !== "*");
      tokens.push({
        surface: t.surface_form,
        reading,
        lemma: t.basic_form && t.basic_form !== "*" ? t.basic_form : t.surface_form,
        pos,
        start,
        end,
        isUnknown: !t.reading,
      });
    }
    return tokens;
  }
}

// For tests that need to reset the singleton dictionary state.
export function _resetKuromojiTokenizer(): void {
  tokenizerPromise = null;
}
