import type { ParagraphResult } from "./types.js";

export interface CacheKeyParts {
  analyzer: string;
  analyzerVersion: string;
  policyVersion: string;
  dictVersion: string;
}

export function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function paragraphCacheKey(text: string, parts: CacheKeyParts): string {
  return `${parts.analyzer}@${parts.analyzerVersion}|pol=${parts.policyVersion}|dict=${parts.dictVersion}|p=${djb2(text)}`;
}

export interface ParagraphCache {
  get(key: string): ParagraphResult | undefined;
  set(key: string, value: ParagraphResult): void;
  invalidate(predicate?: (key: string) => boolean): void;
  size(): number;
}

export class MemoryParagraphCache implements ParagraphCache {
  private store = new Map<string, ParagraphResult>();
  get(key: string): ParagraphResult | undefined {
    return this.store.get(key);
  }
  set(key: string, value: ParagraphResult): void {
    this.store.set(key, value);
  }
  invalidate(predicate?: (key: string) => boolean): void {
    if (!predicate) {
      this.store.clear();
      return;
    }
    for (const k of [...this.store.keys()]) if (predicate(k)) this.store.delete(k);
  }
  size(): number {
    return this.store.size;
  }
}
