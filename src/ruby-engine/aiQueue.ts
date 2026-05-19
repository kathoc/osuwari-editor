import type { AiReviewItem, MorphToken } from "./types.js";

export interface AiQueueOptions {
  contextWindow?: number; // chars before/after
}

export function buildContextWindow(text: string, start: number, end: number, window = 30): string {
  const lo = Math.max(0, start - window);
  const hi = Math.min(text.length, end + window);
  const before = text.slice(lo, start);
  const target = text.slice(start, end);
  const after = text.slice(end, hi);
  return `${before}【${target}】${after}`;
}

export function buildAiReviewItem(
  token: MorphToken,
  fullText: string,
  candidates: string[],
  reason: string,
  opts: AiQueueOptions = {},
): AiReviewItem {
  return {
    start: token.start,
    end: token.end,
    base: token.surface,
    context: buildContextWindow(fullText, token.start, token.end, opts.contextWindow ?? 30),
    candidates,
    reason,
  };
}

export function aiCacheKey(base: string, context: string): string {
  // contextHash is a coarse fingerprint of the surrounding window.
  // Cheap, deterministic, non-cryptographic — collisions are acceptable here
  // because the worst case is one extra AI call.
  let h = 5381;
  for (let i = 0; i < context.length; i++) h = ((h * 33) ^ context.charCodeAt(i)) >>> 0;
  return `${base}::${h.toString(36)}`;
}
