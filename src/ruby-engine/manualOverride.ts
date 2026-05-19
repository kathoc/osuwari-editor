import type { RubyMode, RubySpan } from "./types.js";

export interface ManualOverride {
  paragraphId?: string;
  start: number;
  end: number;
  base: string;
  ruby: string;
  rubyMode?: RubyMode;
  scope?: "occurrence" | "all";
}

export interface ManualOverrideStore {
  forParagraph(paragraphId: string): ManualOverride[];
  globalForSurface(surface: string): ManualOverride | undefined;
  add(o: ManualOverride): void;
  remove(predicate: (o: ManualOverride) => boolean): void;
}

export class InMemoryManualOverrides implements ManualOverrideStore {
  private items: ManualOverride[] = [];
  forParagraph(paragraphId: string): ManualOverride[] {
    return this.items.filter((o) => o.paragraphId === paragraphId && o.scope !== "all");
  }
  globalForSurface(surface: string): ManualOverride | undefined {
    return this.items.find((o) => o.scope === "all" && o.base === surface);
  }
  add(o: ManualOverride): void {
    this.items.push(o);
  }
  remove(predicate: (o: ManualOverride) => boolean): void {
    this.items = this.items.filter((o) => !predicate(o));
  }
}

/**
 * Apply manual overrides on top of an existing rubySpans list. Manual entries
 * win over any other source. Spans matched by base+range are replaced; spans
 * with `scope:"all"` are applied to any matching base.
 */
export function applyManualOverrides(
  paragraphId: string,
  spans: RubySpan[],
  store: ManualOverrideStore,
): RubySpan[] {
  const perParagraph = store.forParagraph(paragraphId);
  return spans.map((span) => {
    const direct = perParagraph.find(
      (o) => o.start === span.start && o.end === span.end && o.base === span.base,
    );
    const global = store.globalForSurface(span.base);
    const override = direct ?? global;
    if (!override) return span;
    return {
      ...span,
      ruby: override.ruby,
      rubyMode: override.rubyMode ?? span.rubyMode,
      source: "manual",
      confidence: 1,
      reason: "manual override",
      flags: span.flags.filter((f) => f !== "low_confidence" && f !== "multiple_candidates"),
      // Manual overrides may invalidate the mono segmentation we computed.
      segments: undefined,
    };
  });
}
