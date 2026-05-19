import type { MorphToken, RubyPolicy } from "./types.js";
import { hasKanji, isAllHiragana } from "./normalize.js";

export interface NeedRubyDecision {
  needRuby: boolean;
  reason: string;
  flags: string[];
}

export function judgeNeedRuby(token: MorphToken, policy: RubyPolicy): NeedRubyDecision {
  const flags: string[] = [];
  if (!hasKanji(token.surface)) {
    return { needRuby: false, reason: "no kanji", flags };
  }
  if (isAllHiragana(token.surface)) {
    return { needRuby: false, reason: "all hiragana", flags };
  }
  const posStr = token.pos.join("/");
  if (posStr.includes("固有名詞")) {
    flags.push("proper_noun");
    if (!policy.rubyOnProperNoun) {
      return { needRuby: false, reason: "policy: skip proper noun", flags };
    }
  }
  if (token.isUnknown) flags.push("unknown_word");
  if (/[0-9０-９]/.test(token.surface)) flags.push("contains_digits");
  // Reader-level gating. For now, always ruby kanji-bearing tokens at "general"
  // and below; cleanup-by-level lives in policy refinement.
  switch (policy.readerLevel) {
    case "elementary_low":
    case "elementary_mid":
    case "general":
      return { needRuby: true, reason: `kanji-bearing token (level=${policy.readerLevel})`, flags };
  }
}
