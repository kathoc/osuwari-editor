export type RubySource =
  | "dictionary"
  | "rule"
  | "context_rule"
  | "user_dictionary"
  | "ai"
  | "manual"
  | "unknown";

export type RubyMode = "mono" | "group" | "jukugo" | "unknown";

export interface RubySegment {
  start: number;
  end: number;
  base: string;
  ruby: string;
}

export interface RubySpan {
  start: number;
  end: number;
  base: string;
  ruby: string;
  rubyMode: RubyMode;
  segments?: RubySegment[];
  needRuby: boolean;
  source: RubySource;
  confidence: number;
  reason: string;
  flags: string[];
}

export interface AiReviewItem {
  start: number;
  end: number;
  base: string;
  context: string;
  candidates: string[];
  reason: string;
}

export interface ParagraphResult {
  paragraphId: string;
  text: string;
  rubySpans: RubySpan[];
  aiReviewQueue: AiReviewItem[];
}

export interface MorphToken {
  surface: string;
  reading: string;
  lemma: string;
  pos: string[];
  start: number;
  end: number;
  isUnknown: boolean;
}

export interface MorphAnalyzer {
  name: string;
  version: string;
  analyze(text: string): Promise<MorphToken[]>;
}

export interface UserDictEntry {
  surface: string;
  reading: string;
  pos?: string;
  priority?: number;
  scope?: "global" | "project";
  rubyMode?: RubyMode;
}

export interface ContextCondition {
  next?: string[];
  nextPos?: string;
  prev?: string[];
  prevPos?: string;
  inWord?: string;
}

export interface AmbiguousCandidate {
  ruby: string;
  reason: string;
  conditions?: ContextCondition[];
  rubyMode?: RubyMode;
}

export interface AmbiguousReadingRule {
  surface: string;
  candidates: AmbiguousCandidate[];
  defaultRuby?: string;
  defaultReason?: string;
}

export interface RubyPolicy {
  readerLevel: "elementary_low" | "elementary_mid" | "general";
  rubyOnProperNoun: boolean;
  rubyOnFirstOccurrenceOnly: boolean;
  confidenceThreshold: number;
  jukugoEnabled?: boolean;
}

export interface RubyEngineConfig {
  policy: RubyPolicy;
  userDictionary: UserDictEntry[];
  projectDictionary: UserDictEntry[];
  ambiguousReadings: AmbiguousReadingRule[];
  kanjiReadingMap?: Record<string, string[]>;
  jukujikun?: Record<string, string>;
}
