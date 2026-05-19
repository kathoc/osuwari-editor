// 「ローカルAI(オンデバイス)」用の renderer ヘルパ
// Electron main プロセスから contextBridge 経由で公開される osuwariLLM API と、
// @electron/llm が自動注入する window.electronAi をラップする。

export interface LocalLlmStatus {
  installed: boolean;
  downloading: boolean;
  sizeBytes: number;
  expectedSizeBytes: number;
  modelAlias: string;
}

export type LocalLlmProgress =
  | { status: "downloading"; received: number; total: number }
  | { status: "done"; received: number; total: number }
  | { status: "cancelled"; received: number; total: number }
  | { status: "error"; received: number; total: number; error: string };

interface OsuwariLlmBridge {
  status: () => Promise<LocalLlmStatus>;
  startDownload: () => Promise<{ ok: boolean; reason?: string; error?: string }>;
  cancelDownload: () => Promise<{ ok: boolean; reason?: string }>;
  deleteModel: () => Promise<{ ok: boolean; reason?: string; error?: string }>;
  modelAlias: () => Promise<string>;
  onProgress: (cb: (p: LocalLlmProgress) => void) => () => void;
}

interface ElectronAiBridge {
  create: (options: { modelAlias: string; systemPrompt?: string; temperature?: number; topK?: number }) => Promise<void>;
  destroy: () => Promise<void>;
  prompt: (input: string, options?: { timeout?: number }) => Promise<string>;
}

declare global {
  interface Window {
    osuwariLLM?: OsuwariLlmBridge;
    electronAi?: ElectronAiBridge;
  }
}

export function hasLocalLlmBridge(): boolean {
  return typeof window !== "undefined" && !!window.osuwariLLM && !!window.electronAi;
}

export function getLocalLlmBridge(): OsuwariLlmBridge | null {
  if (typeof window === "undefined") return null;
  return window.osuwariLLM || null;
}

export function getElectronAi(): ElectronAiBridge | null {
  if (typeof window === "undefined") return null;
  return window.electronAi || null;
}

let modelCreatedFor: string | null = null;
let creating: Promise<void> | null = null;

export async function ensureLocalLlmReady(): Promise<boolean> {
  const bridge = getLocalLlmBridge();
  const ai = getElectronAi();
  if (!bridge || !ai) return false;
  const status = await bridge.status();
  if (!status.installed) return false;
  if (modelCreatedFor === status.modelAlias) return true;
  if (!creating) {
    creating = ai
      .create({
        modelAlias: status.modelAlias,
        temperature: 0.7,
        topK: 10,
      })
      .then(() => {
        modelCreatedFor = status.modelAlias;
      })
      .finally(() => {
        creating = null;
      });
  }
  try {
    await creating;
    return modelCreatedFor === status.modelAlias;
  } catch (e) {
    console.warn("local-llm create failed", e);
    return false;
  }
}

export async function promptLocalLlm(input: string, timeoutMs = 60000): Promise<string> {
  const ai = getElectronAi();
  if (!ai) throw new Error("electronAi unavailable");
  return await ai.prompt(input, { timeout: timeoutMs });
}
