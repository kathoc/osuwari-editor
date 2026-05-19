import type { RubySource } from "./types.js";

export interface ConfidenceInput {
  source: RubySource;
  flags: string[];
  contextResolved?: boolean;
  contextConfidence?: number;
  monoSplit?: boolean;
  candidateCount?: number;
}

const SOURCE_BASE: Record<RubySource, number> = {
  manual: 1.0,
  user_dictionary: 0.95,
  dictionary: 0.85,
  context_rule: 0.8,
  rule: 0.7,
  ai: 0.7,
  unknown: 0.3,
};

export function scoreConfidence(input: ConfidenceInput): number {
  let score = SOURCE_BASE[input.source] ?? 0.5;
  if (input.contextResolved && typeof input.contextConfidence === "number") {
    score = Math.max(score, input.contextConfidence);
    if (input.contextConfidence < 0.5) score = Math.min(score, input.contextConfidence + 0.1);
  }
  if (input.flags.includes("proper_noun")) score -= 0.05;
  if (input.flags.includes("unknown_word")) score -= 0.2;
  if (input.flags.includes("multiple_candidates")) score -= 0.1;
  if (input.flags.includes("no_reading")) score -= 0.4;
  if (input.monoSplit) score += 0.02;
  if ((input.candidateCount ?? 1) > 2) score -= 0.05;
  return clamp(score, 0, 1);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
