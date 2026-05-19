import type {
  AmbiguousReadingRule,
  MorphToken,
  RubyMode,
  RubySource,
  UserDictEntry,
} from "./types.js";

export interface RubyCandidate {
  ruby: string;
  source: RubySource;
  reason: string;
  rubyMode?: RubyMode;
  candidates: string[];
  flags: string[];
}

export interface CandidateInputs {
  token: MorphToken;
  userDict: Map<string, UserDictEntry>;
  projectDict: Map<string, UserDictEntry>;
  ambiguous: Map<string, AmbiguousReadingRule>;
}

export function generateCandidate(input: CandidateInputs): RubyCandidate {
  const { token, userDict, projectDict, ambiguous } = input;
  const flags: string[] = [];
  const userHit = userDict.get(token.surface) ?? userDict.get(token.lemma);
  if (userHit) {
    return {
      ruby: userHit.reading,
      source: "user_dictionary",
      reason: "user dictionary match",
      rubyMode: userHit.rubyMode,
      candidates: [userHit.reading],
      flags,
    };
  }
  const projectHit = projectDict.get(token.surface) ?? projectDict.get(token.lemma);
  if (projectHit) {
    return {
      ruby: projectHit.reading,
      source: "dictionary",
      reason: "project dictionary match",
      rubyMode: projectHit.rubyMode,
      candidates: [projectHit.reading],
      flags,
    };
  }
  const amb = ambiguous.get(token.surface);
  if (amb) {
    // Defer to context resolution; surface all candidates as alternates.
    const list = amb.candidates.map((c) => c.ruby);
    flags.push("multiple_candidates");
    return {
      ruby: amb.defaultRuby ?? list[0] ?? token.reading,
      source: "context_rule",
      reason: "ambiguous surface — pending context resolution",
      candidates: list,
      flags,
    };
  }
  if (token.reading && token.reading !== token.surface) {
    return {
      ruby: token.reading,
      source: "dictionary",
      reason: "analyzer reading",
      candidates: [token.reading],
      flags,
    };
  }
  flags.push("no_reading");
  return {
    ruby: token.reading || "",
    source: "unknown",
    reason: "no reading available",
    candidates: token.reading ? [token.reading] : [],
    flags,
  };
}
