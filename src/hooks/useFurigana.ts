import { useEffect, useMemo, useRef, useState } from "react";
import type { AIAdapter } from "../lib/ai/types";
import { type RubyReading, type RubyReviewItem } from "../lib/analyze";

export type FuriganaStatus = "idle" | "processing" | "ready" | "error";

interface State {
  readings: RubyReading[];
  reviewQueue: RubyReviewItem[];
  status: FuriganaStatus;
  error: string | null;
  progress: { done: number; total: number };
  refresh: () => void;
}

interface RubySegmentDTO {
  start: number;
  end: number;
  base: string;
  ruby: string;
}
interface RubySpanDTO {
  start: number;
  end: number;
  base: string;
  ruby: string;
  rubyMode: "mono" | "group" | "jukugo" | "unknown";
  segments?: RubySegmentDTO[];
  needRuby: boolean;
  source: string;
  confidence: number;
  reason: string;
  flags: string[];
}
interface AiReviewItemDTO {
  start: number;
  end: number;
  base: string;
  context: string;
  candidates: string[];
  reason: string;
}
interface ParagraphResultDTO {
  paragraphId: string;
  text: string;
  rubySpans: RubySpanDTO[];
  aiReviewQueue: AiReviewItemDTO[];
}
interface AnalyzeResponse {
  results: ParagraphResultDTO[];
}

const HAS_KANJI = /[㐀-鿿々]/;

const API_BASE = (import.meta.env?.VITE_OSUWARI_API as string | undefined) || "";

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function splitParagraphs(text: string): { id: string; text: string; offset: number }[] {
  const out: { id: string; text: string; offset: number }[] = [];
  let offset = 0;
  for (const part of text.split(/(\n)/)) {
    if (part === "\n") {
      offset += 1;
      continue;
    }
    if (part.length > 0) {
      out.push({ id: `p_${out.length}_${djb2(part)}`, text: part, offset });
      offset += part.length;
    }
  }
  return out;
}

const KANJI_RE = /^[㐀-鿿々]+$/u;

/**
 * Build segment list for the renderer. Each segment becomes its own <ruby>
 * element, so per-kanji ruby alignment is exact and line-wrap inside a
 * compound is rendered as 大（たい）/ 切（せつ） naturally.
 *
 * Returns positions absolute to the full document text (offset added).
 *
 * Priority:
 *   1. Engine-provided mono segments (most accurate).
 *   2. Base is all-kanji of length N with kana length >= N → uniform per-char split.
 *   3. Otherwise: a single segment covering the whole span (group mode etc.).
 */
function spanToSegments(
  span: RubySpanDTO,
  offset: number,
): { start: number; end: number; base: string; ruby: string }[] {
  if (span.rubyMode === "mono" && span.segments && span.segments.length > 0) {
    return span.segments.map((s) => ({
      start: offset + span.start + s.start,
      end: offset + span.start + s.end,
      base: s.base,
      ruby: s.ruby,
    }));
  }
  if (span.rubyMode !== "group") {
    const base = span.base;
    if (base.length >= 2 && KANJI_RE.test(base) && span.ruby.length >= base.length) {
      const n = base.length;
      const k = span.ruby.length;
      const out: { start: number; end: number; base: string; ruby: string }[] = [];
      for (let i = 0; i < n; i++) {
        const s = Math.round((i * k) / n);
        const e = Math.round(((i + 1) * k) / n);
        out.push({
          start: offset + span.start + i,
          end: offset + span.start + i + 1,
          base: base[i],
          ruby: span.ruby.slice(s, e),
        });
      }
      return out;
    }
  }
  return [
    {
      start: offset + span.start,
      end: offset + span.end,
      base: span.base,
      ruby: span.ruby,
    },
  ];
}

interface CacheEntry {
  results: ParagraphResultDTO[];
  hash: string;
}
const responseCache = new Map<string, CacheEntry>();
const CACHE_MAX = 200;

async function fetchAnalyze(
  paragraphs: { id: string; text: string }[],
  noCache = false,
): Promise<ParagraphResultDTO[]> {
  const r = await fetch(`${API_BASE}/api/ruby/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paragraphs, noCache }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => `HTTP ${r.status}`);
    throw new Error(msg || `HTTP ${r.status}`);
  }
  const json = (await r.json()) as AnalyzeResponse;
  return json.results;
}

export function useFurigana(
  text: string,
  enabled: boolean,
  _adapter: AIAdapter,
  manualBases: string[],
): State {
  const [readings, setReadings] = useState<RubyReading[]>([]);
  const [reviewQueue, setReviewQueue] = useState<RubyReviewItem[]>([]);
  const [status, setStatus] = useState<FuriganaStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const manualSet = useMemo(() => new Set(manualBases), [manualBases]);
  const reqIdRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const refreshNonceRef = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setError(null);
      setReadings([]);
      setReviewQueue([]);
      setProgress({ done: 0, total: 0 });
      return;
    }
    if (!text || !HAS_KANJI.test(text)) {
      setStatus("ready");
      setError(null);
      setReadings([]);
      setReviewQueue([]);
      setProgress({ done: 0, total: 0 });
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const myId = ++reqIdRef.current;
      // If a refresh was requested, consume the nonce: skip the local cache and
      // ask the server to bust its cache too.
      const noCache = refreshNonceRef.current > 0;
      if (noCache) refreshNonceRef.current = 0;
      setStatus("processing");
      setError(null);

      const paragraphs = splitParagraphs(text);
      setProgress({ done: 0, total: paragraphs.length });

      const cached: Map<number, ParagraphResultDTO> = new Map();
      const toFetch: { idx: number; id: string; text: string; offset: number }[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const hit = noCache ? undefined : responseCache.get(p.id);
        if (hit) cached.set(i, hit.results[0]);
        else toFetch.push({ idx: i, ...p });
      }

      const run = async () => {
        try {
          let fetched: ParagraphResultDTO[] = [];
          if (toFetch.length > 0) {
            fetched = await fetchAnalyze(toFetch.map((p) => ({ id: p.id, text: p.text })), noCache);
          }
          if (myId !== reqIdRef.current) return; // stale

          // Stitch results back into per-paragraph order with original offsets.
          for (let i = 0; i < toFetch.length; i++) {
            const slot = toFetch[i];
            const result = fetched[i];
            cached.set(slot.idx, result);
            responseCache.set(slot.id, { results: [result], hash: slot.id });
          }
          if (responseCache.size > CACHE_MAX) {
            const drop = responseCache.size - CACHE_MAX;
            const keys = [...responseCache.keys()].slice(0, drop);
            for (const k of keys) responseCache.delete(k);
          }

          const out: RubyReading[] = [];
          const review: RubyReviewItem[] = [];
          for (let i = 0; i < paragraphs.length; i++) {
            const offset = paragraphs[i].offset;
            const result = cached.get(i);
            if (!result) continue;
            for (const span of result.rubySpans) {
              if (!span.needRuby || !span.ruby) continue;
              if (manualSet.has(span.base)) continue;
              const segments = spanToSegments(span, offset);
              out.push({
                start: offset + span.start,
                end: offset + span.end,
                kana: span.ruby,
                manual: false,
                segments,
                source: span.source as RubyReading["source"],
                confidence: span.confidence,
                reason: span.reason,
                flags: span.flags,
                rubyMode: span.rubyMode,
              });
            }
            for (const item of result.aiReviewQueue ?? []) {
              if (manualSet.has(item.base)) continue;
              review.push({
                start: offset + item.start,
                end: offset + item.end,
                base: item.base,
                context: item.context,
                candidates: item.candidates,
                reason: item.reason,
              });
            }
          }
          out.sort((a, b) => a.start - b.start);
          review.sort((a, b) => a.start - b.start);
          setReadings(out);
          setReviewQueue(review);
          setProgress({ done: paragraphs.length, total: paragraphs.length });
          setStatus("ready");
        } catch (e) {
          if (myId !== reqIdRef.current) return;
          setError(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      };
      void run();
    }, 250);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [text, enabled, manualSet, refreshTick]);

  const refresh = () => {
    responseCache.clear();
    refreshNonceRef.current += 1;
    setRefreshTick((n) => n + 1);
  };

  return { readings, reviewQueue, status, error, progress, refresh };
}
