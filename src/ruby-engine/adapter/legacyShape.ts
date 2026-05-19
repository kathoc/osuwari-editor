/**
 * Adapter from new ruby-engine output to the existing UI's RubyReading shape.
 * Used only while we run both engines side-by-side behind a feature flag.
 *
 * Kept deliberately tiny so removing the old engine later only requires deleting
 * this file and the flag check.
 */
import type { ParagraphResult, RubySpan } from "../types.js";

export interface LegacyRubyReading {
  start: number;
  end: number;
  kana: string;
  manual: boolean;
}

export function paragraphToLegacyReadings(result: ParagraphResult): LegacyRubyReading[] {
  return result.rubySpans
    .filter((s: RubySpan) => s.needRuby && s.ruby)
    .map((s) => ({
      start: s.start,
      end: s.end,
      kana: s.ruby,
      manual: s.source === "manual",
    }));
}

export function rubyEngineV2Enabled(): boolean {
  // Off by default — flip via env or runtime config when the UI is ready.
  const v = (typeof process !== "undefined" ? process.env?.RUBY_ENGINE_V2 : undefined) ?? "";
  return v === "1" || v === "true" || v === "on";
}
