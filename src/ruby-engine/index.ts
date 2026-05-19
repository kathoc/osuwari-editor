import { generateCandidate } from "./candidate.js";
import { resolveAmbiguous } from "./contextRules.js";
import { judgeNeedRuby } from "./needRuby.js";
import { normalizeText, splitSurfaceBlocks } from "./normalize.js";
import { segmentRuby } from "./rubySegments.js";
import { scoreConfidence } from "./confidence.js";
import { buildAiReviewItem } from "./aiQueue.js";
import { applyManualOverrides, type ManualOverrideStore } from "./manualOverride.js";
import {
  djb2,
  MemoryParagraphCache,
  paragraphCacheKey,
  type CacheKeyParts,
  type ParagraphCache,
} from "./cache.js";
import { indexAmbiguous, indexDictionary, loadConfig, type LoadConfigOptions } from "./dictionaries.js";
import { KuromojiAdapter } from "./morphology/KuromojiAdapter.js";
import type {
  AiReviewItem,
  MorphAnalyzer,
  ParagraphResult,
  RubyEngineConfig,
  RubySpan,
} from "./types.js";

export interface RubyEngineOptions {
  analyzer?: MorphAnalyzer;
  config?: RubyEngineConfig;
  loadConfigOptions?: LoadConfigOptions;
  cache?: ParagraphCache;
  manualOverrides?: ManualOverrideStore;
  contextWindow?: number;
}

export interface ProcessOptions {
  paragraphId?: string;
}

export class RubyEngine {
  private analyzer: MorphAnalyzer;
  private config: RubyEngineConfig;
  private cache: ParagraphCache;
  private manualOverrides?: ManualOverrideStore;
  private userDict: Map<string, import("./types.js").UserDictEntry>;
  private projectDict: Map<string, import("./types.js").UserDictEntry>;
  private ambiguous: Map<string, import("./types.js").AmbiguousReadingRule>;
  private contextWindow: number;

  constructor(opts: RubyEngineOptions = {}) {
    this.analyzer = opts.analyzer ?? new KuromojiAdapter();
    this.config = opts.config ?? loadConfig(opts.loadConfigOptions);
    this.cache = opts.cache ?? new MemoryParagraphCache();
    this.manualOverrides = opts.manualOverrides;
    this.userDict = indexDictionary(this.config.userDictionary);
    this.projectDict = indexDictionary(this.config.projectDictionary);
    this.ambiguous = indexAmbiguous(this.config.ambiguousReadings);
    this.contextWindow = opts.contextWindow ?? 30;
  }

  private cacheKeyParts(): CacheKeyParts {
    return {
      analyzer: this.analyzer.name,
      analyzerVersion: this.analyzer.version,
      policyVersion: djb2(JSON.stringify(this.config.policy)),
      dictVersion: djb2(
        JSON.stringify([
          this.config.userDictionary,
          this.config.projectDictionary,
          this.config.ambiguousReadings,
        ]),
      ),
    };
  }

  invalidateCache(): void {
    this.cache.invalidate();
  }

  async processParagraph(text: string, opts: ProcessOptions = {}): Promise<ParagraphResult> {
    const paragraphId = opts.paragraphId ?? `p_${djb2(text)}`;
    const key = paragraphCacheKey(text, this.cacheKeyParts());
    const cached = this.cache.get(key);
    if (cached && cached.paragraphId === paragraphId) return cached;

    const normalized = normalizeText(text);
    const tokens = await this.analyzer.analyze(normalized.text);

    const rubySpans: RubySpan[] = [];
    const aiReviewQueue: AiReviewItem[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const need = judgeNeedRuby(token, this.config.policy);
      if (!need.needRuby) continue;

      const cand = generateCandidate({
        token,
        userDict: this.userDict as any,
        projectDict: this.projectDict as any,
        ambiguous: this.ambiguous as any,
      });
      let ruby = cand.ruby;
      let source = cand.source;
      let reason = cand.reason;
      let candidates = cand.candidates.slice();
      let flags = [...need.flags, ...cand.flags];
      let contextResolved = false;
      let contextConfidence: number | undefined;
      let rubyModeHint = cand.rubyMode;

      const amb = this.ambiguous.get(token.surface);
      if (amb) {
        const res = resolveAmbiguous(amb, tokens, i, normalized.text);
        ruby = res.ruby;
        reason = res.reason;
        contextResolved = res.confidence >= 0.7;
        contextConfidence = res.confidence;
        source = contextResolved ? "context_rule" : source;
        candidates = res.candidates;
      }

      if (!ruby) {
        flags.push("no_reading");
      }

      // 「成り立ち」「思い出す」など漢字とひらがなが交互に並ぶ語は、
      // 各 kana ブロックを ruby 上のアンカーとして使って漢字ブロックを分離する。
      const subSpans = expandMixedSurfaceSpans({
        token,
        ruby,
        source,
        reason,
        rubyModeHint,
        baseFlags: [...flags],
        baseCandidates: [...candidates],
        contextResolved,
        contextConfidence,
        kanjiReadingMap: this.config.kanjiReadingMap ?? {},
        jukujikun: this.config.jukujikun ?? {},
      });
      rubySpans.push(...subSpans);
      const lastConfidence = subSpans.length > 0 ? Math.min(...subSpans.map((s) => s.confidence)) : 1;
      const confidence = lastConfidence;

      if (confidence < this.config.policy.confidenceThreshold) {
        flags.push("low_confidence");
        aiReviewQueue.push(
          buildAiReviewItem(
            token,
            normalized.text,
            candidates.length > 0 ? candidates : ruby ? [ruby] : [],
            `confidence ${confidence.toFixed(2)} < threshold ${this.config.policy.confidenceThreshold}`,
            { contextWindow: this.contextWindow },
          ),
        );
      }
    }

    let finalSpans = rubySpans;
    if (this.manualOverrides) {
      finalSpans = applyManualOverrides(paragraphId, rubySpans, this.manualOverrides);
    }

    const result: ParagraphResult = {
      paragraphId,
      text,
      rubySpans: finalSpans,
      aiReviewQueue,
    };
    this.cache.set(key, result);
    return result;
  }

  async processParagraphs(paragraphs: string[]): Promise<ParagraphResult[]> {
    const out: ParagraphResult[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      out.push(await this.processParagraph(paragraphs[i], { paragraphId: `p_${i}` }));
    }
    return out;
  }
}

interface ExpandInputs {
  token: import("./types.js").MorphToken;
  ruby: string;
  source: import("./types.js").RubySource;
  reason: string;
  rubyModeHint?: import("./types.js").RubyMode;
  baseFlags: string[];
  baseCandidates: string[];
  contextResolved: boolean;
  contextConfidence?: number;
  kanjiReadingMap: Record<string, string[]>;
  jukujikun: Record<string, string>;
}

function expandMixedSurfaceSpans(input: ExpandInputs): RubySpan[] {
  const { token, ruby, source, reason, rubyModeHint, baseFlags, baseCandidates, contextResolved, contextConfidence } = input;
  const blocks = splitSurfaceBlocks(token.surface);
  if (!blocks || blocks.length === 0) {
    return [buildSpan(token.start, token.end, token.surface, ruby, input)];
  }
  // Pure kanji or pure kana: no mixed handling needed.
  const kanjiBlocks = blocks.filter((b) => b.kind === "kanji");
  if (kanjiBlocks.length === 0) {
    return []; // shouldn't happen — needRuby gated kanji presence
  }
  if (kanjiBlocks.length === 1 && blocks.length <= 2) {
    // Simple form: pure kanji, or kanji + trailing okurigana.
    let rubyBase = kanjiBlocks[0].text;
    let rubyEnd = token.start + kanjiBlocks[0].end;
    let kanaSlice = ruby;
    if (blocks.length === 2 && blocks[1].kind === "kana") {
      const okuri = blocks[1].text;
      if (kanaSlice.endsWith(okuri)) {
        kanaSlice = kanaSlice.slice(0, kanaSlice.length - okuri.length);
      }
    } else if (blocks.length === 2 && blocks[0].kind === "kana") {
      // 前置 kana — まれ。okurigana 剥がしと同様に頭を剥がす。
      const head = blocks[0].text;
      if (kanaSlice.startsWith(head)) kanaSlice = kanaSlice.slice(head.length);
      rubyBase = kanjiBlocks[0].text;
    }
    if (!kanaSlice) return [];
    return [buildSpan(token.start + kanjiBlocks[0].start, rubyEnd, rubyBase, kanaSlice, input)];
  }
  // Mixed: kanji/kana/kanji/... split ruby using kana blocks as anchors.
  const spans: RubySpan[] = [];
  let rubyPos = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "kana") {
      // Consume from ruby; if mismatched, abort the mixed split and fall back.
      if (!ruby.startsWith(b.text, rubyPos)) {
        return [buildSpan(token.start, token.end, token.surface, ruby, input)];
      }
      rubyPos += b.text.length;
      continue;
    }
    // kanji block — find rubyEnd via next kana block or end of ruby
    const nextKana = blocks.slice(i + 1).find((x) => x.kind === "kana");
    let rubyEndPos: number;
    if (nextKana) {
      const idx = ruby.indexOf(nextKana.text, rubyPos);
      if (idx < rubyPos) {
        return [buildSpan(token.start, token.end, token.surface, ruby, input)];
      }
      rubyEndPos = idx;
    } else {
      rubyEndPos = ruby.length;
    }
    const blockRuby = ruby.slice(rubyPos, rubyEndPos);
    if (!blockRuby) {
      return [buildSpan(token.start, token.end, token.surface, ruby, input)];
    }
    spans.push(
      buildSpan(token.start + b.start, token.start + b.end, b.text, blockRuby, input),
    );
    rubyPos = rubyEndPos;
  }
  return spans;

  function buildSpan(start: number, end: number, base: string, kana: string, inp: ExpandInputs): RubySpan {
    const seg = segmentRuby(base, kana, { kanjiReadingMap: inp.kanjiReadingMap, jukujikun: inp.jukujikun });
    const mode = rubyModeHint ?? seg.rubyMode;
    const conf = scoreConfidence({
      source,
      flags: baseFlags,
      contextResolved,
      contextConfidence,
      monoSplit: mode === "mono",
      candidateCount: baseCandidates.length,
    });
    return {
      start,
      end,
      base,
      ruby: kana,
      rubyMode: mode,
      segments: mode === "mono" ? seg.segments : undefined,
      needRuby: true,
      source,
      confidence: conf,
      reason: reason + (seg.reason ? `; ${seg.reason}` : ""),
      flags: [...baseFlags],
    };
  }
}

export type { ParagraphResult, RubySpan, AiReviewItem, MorphAnalyzer, RubyEngineConfig } from "./types.js";
export { loadConfig } from "./dictionaries.js";
export { MockAnalyzer } from "./morphology/MockAnalyzer.js";
export { KuromojiAdapter } from "./morphology/KuromojiAdapter.js";
export { InMemoryManualOverrides } from "./manualOverride.js";
