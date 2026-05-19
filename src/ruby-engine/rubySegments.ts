import type { RubyMode, RubySegment } from "./types.js";
import { isKanji } from "./normalize.js";

export interface SegmentationResult {
  rubyMode: RubyMode;
  segments?: RubySegment[];
  reason: string;
}

const RENDAKU: Record<string, string> = {
  "か":"が","き":"ぎ","く":"ぐ","け":"げ","こ":"ご",
  "さ":"ざ","し":"じ","す":"ず","せ":"ぜ","そ":"ぞ",
  "た":"だ","ち":"ぢ","つ":"づ","て":"で","と":"ど",
  "は":"ば","ひ":"び","ふ":"ぶ","へ":"べ","ほ":"ぼ",
};
const HANDAKU: Record<string, string> = {
  "は":"ぱ","ひ":"ぴ","ふ":"ぷ","へ":"ぺ","ほ":"ぽ",
};
const SOKUON_TAIL = /[つちくき]$/;

function expandVariants(reading: string, hasNext: boolean): string[] {
  if (!reading) return [];
  const variants = new Set<string>([reading]);
  const first = reading[0];
  if (RENDAKU[first]) variants.add(RENDAKU[first] + reading.slice(1));
  if (HANDAKU[first]) variants.add(HANDAKU[first] + reading.slice(1));
  if (hasNext && SOKUON_TAIL.test(reading)) {
    variants.add(reading.slice(0, -1) + "っ");
  }
  return [...variants];
}

export interface MonoSplitOptions {
  kanjiReadingMap: Record<string, string[]>;
  jukujikun?: Record<string, string>;
}

export function segmentRuby(
  base: string,
  ruby: string,
  opts: MonoSplitOptions,
): SegmentationResult {
  if (!base || !ruby) {
    return { rubyMode: "unknown", reason: "empty base or ruby" };
  }
  // Jukujikun override: forced group reading.
  if (opts.jukujikun && opts.jukujikun[base] === ruby) {
    return { rubyMode: "group", reason: "jukujikun dictionary match" };
  }
  // If base has no kanji, there's no segmentation question.
  const chars = [...base];
  if (!chars.some(isKanji)) {
    return { rubyMode: "group", reason: "no kanji in base" };
  }
  const path = tryAlign(chars, ruby, opts.kanjiReadingMap);
  if (!path) {
    return { rubyMode: "group", reason: "no mono alignment possible" };
  }
  const segments: RubySegment[] = [];
  for (let i = 0; i < chars.length; i++) {
    segments.push({ start: i, end: i + 1, base: chars[i], ruby: path[i] });
  }
  return { rubyMode: "mono", segments, reason: "mono alignment from kanji-reading map" };
}

function tryAlign(
  chars: string[],
  ruby: string,
  kanjiMap: Record<string, string[]>,
): string[] | null {
  const n = chars.length;
  const m = ruby.length;
  const memo = new Map<number, string[] | null>();

  const visit = (i: number, j: number): string[] | null => {
    if (i === n) return j === m ? [] : null;
    const key = i * (m + 1) + j;
    if (memo.has(key)) return memo.get(key)!;
    const c = chars[i];
    const hasNext = i + 1 < n;
    let result: string[] | null = null;
    if (!isKanji(c)) {
      // Okurigana / kana / punctuation — must match literally.
      if (ruby.startsWith(c, j)) {
        const rest = visit(i + 1, j + c.length);
        if (rest) result = [c, ...rest];
      }
    } else {
      const candidates = kanjiMap[c] ?? [];
      for (const cand of candidates) {
        for (const v of expandVariants(cand, hasNext)) {
          if (!v) continue;
          if (ruby.startsWith(v, j)) {
            const rest = visit(i + 1, j + v.length);
            if (rest) {
              result = [v, ...rest];
              break;
            }
          }
        }
        if (result) break;
      }
    }
    memo.set(key, result);
    return result;
  };

  return visit(0, 0);
}
