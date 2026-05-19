import type { AmbiguousReadingRule, ContextCondition, MorphToken } from "./types.js";

export interface ContextResolution {
  ruby: string;
  reason: string;
  confidence: number; // 0..1
  matchedConditionIndex?: number;
  candidates: string[];
}

function tokenMatchesNextCondition(
  next: MorphToken | undefined,
  cond: ContextCondition,
): boolean {
  if (cond.next && cond.next.length > 0) {
    if (!next) return false;
    if (!cond.next.includes(next.surface)) return false;
  }
  if (cond.nextPos) {
    if (!next) return false;
    if (!next.pos.join("/").startsWith(cond.nextPos)) return false;
  }
  return true;
}

function tokenMatchesPrevCondition(
  prev: MorphToken | undefined,
  cond: ContextCondition,
): boolean {
  if (cond.prev && cond.prev.length > 0) {
    if (!prev) return false;
    if (!cond.prev.includes(prev.surface)) return false;
  }
  if (cond.prevPos) {
    if (!prev) return false;
    if (!prev.pos.join("/").startsWith(cond.prevPos)) return false;
  }
  return true;
}

function conditionMatches(
  cond: ContextCondition,
  tokens: MorphToken[],
  idx: number,
  surroundingText?: string,
): boolean {
  const prev = idx > 0 ? tokens[idx - 1] : undefined;
  const next = idx + 1 < tokens.length ? tokens[idx + 1] : undefined;
  if (!tokenMatchesNextCondition(next, cond)) return false;
  if (!tokenMatchesPrevCondition(prev, cond)) return false;
  if (cond.inWord && surroundingText) {
    if (!surroundingText.includes(cond.inWord)) return false;
  }
  return true;
}

export function resolveAmbiguous(
  rule: AmbiguousReadingRule,
  tokens: MorphToken[],
  idx: number,
  surroundingText?: string,
): ContextResolution {
  const candidates = rule.candidates.map((c) => c.ruby);
  for (let i = 0; i < rule.candidates.length; i++) {
    const cand = rule.candidates[i];
    const conds = cand.conditions ?? [];
    if (conds.length === 0) continue;
    const matched = conds.some((c) => conditionMatches(c, tokens, idx, surroundingText));
    if (matched) {
      return {
        ruby: cand.ruby,
        reason: cand.reason,
        confidence: 0.85,
        matchedConditionIndex: i,
        candidates,
      };
    }
  }
  // No rule fired — fall back to default but mark low confidence.
  if (rule.defaultRuby) {
    return {
      ruby: rule.defaultRuby,
      reason: rule.defaultReason ?? "default reading (no context rule fired)",
      confidence: 0.4,
      candidates,
    };
  }
  return {
    ruby: rule.candidates[0]?.ruby ?? "",
    reason: "no context rule fired and no default; first candidate selected",
    confidence: 0.3,
    candidates,
  };
}
