import type { Profile } from "../types";
import { mockAdapter } from "./mockAdapter";
import { makeOllamaAdapter } from "./ollamaAdapter";
import { chromeAdapter } from "./chromeAdapter";
import { localLlmAdapter } from "./localLlmAdapter";
import type { AIAdapter } from "./types";

export function getAdapter(profile: Profile): AIAdapter {
  const ai = profile.ai;
  if (!ai || ai.id === "mock") return mockAdapter;
  if (ai.id === "ollama") {
    return makeOllamaAdapter({
      baseUrl: ai.ollama?.baseUrl,
      model: ai.ollama?.model || "llama3.2",
    });
  }
  if (ai.id === "chrome") return chromeAdapter;
  if (ai.id === "local-llm") return localLlmAdapter;
  return mockAdapter;
}
