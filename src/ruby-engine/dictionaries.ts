import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AmbiguousReadingRule,
  RubyEngineConfig,
  RubyPolicy,
  UserDictEntry,
} from "./types.js";

const DEFAULT_POLICY: RubyPolicy = {
  readerLevel: "general",
  rubyOnProperNoun: true,
  rubyOnFirstOccurrenceOnly: false,
  confidenceThreshold: 0.75,
  jukugoEnabled: false,
};

function readJsonIfExists<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const buf = fs.readFileSync(file, "utf8");
    return JSON.parse(buf) as T;
  } catch (e) {
    console.warn(`[ruby-engine] failed to load ${file}: ${(e as Error).message}`);
    return fallback;
  }
}

export interface LoadConfigOptions {
  configDir?: string;
  policy?: Partial<RubyPolicy>;
}

export function defaultConfigDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/ruby-engine -> ../../config
  return path.resolve(here, "..", "..", "config");
}

export function loadConfig(opts: LoadConfigOptions = {}): RubyEngineConfig {
  const dir = opts.configDir ?? defaultConfigDir();
  const policy: RubyPolicy = {
    ...DEFAULT_POLICY,
    ...readJsonIfExists<Partial<RubyPolicy>>(path.join(dir, "ruby-policy.json"), {}),
    ...opts.policy,
  };
  const userDictionary = readJsonIfExists<UserDictEntry[]>(path.join(dir, "user-dictionary.json"), []);
  const projectDictionary = readJsonIfExists<UserDictEntry[]>(path.join(dir, "project-dictionary.json"), []);
  const ambiguousReadings = readJsonIfExists<AmbiguousReadingRule[]>(path.join(dir, "ambiguous-readings.json"), []);
  const kanjiReadingMap = readJsonIfExists<Record<string, string[]>>(path.join(dir, "kanji-reading-map.json"), {});
  const jukujikun = readJsonIfExists<Record<string, string>>(path.join(dir, "jukujikun.json"), {});
  return { policy, userDictionary, projectDictionary, ambiguousReadings, kanjiReadingMap, jukujikun };
}

export function indexDictionary(entries: UserDictEntry[]): Map<string, UserDictEntry> {
  const m = new Map<string, UserDictEntry>();
  for (const e of entries) {
    const prev = m.get(e.surface);
    if (!prev || (e.priority ?? 0) > (prev.priority ?? 0)) m.set(e.surface, e);
  }
  return m;
}

export function indexAmbiguous(rules: AmbiguousReadingRule[]): Map<string, AmbiguousReadingRule> {
  const m = new Map<string, AmbiguousReadingRule>();
  for (const r of rules) m.set(r.surface, r);
  return m;
}
