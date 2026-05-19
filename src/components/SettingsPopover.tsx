import { useEffect, useState } from "react";
import type { AISendKey, AISettings, Profile } from "../lib/types";

interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
  aiStatus: { ok: boolean; label: string };
  onRecheckAI: () => void;
}

export function SettingsPopover({ profile, onChange, aiStatus, onRecheckAI }: Props) {
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });
  const setAi = (patch: Partial<AISettings>) =>
    set({ ai: { id: profile.ai?.id || "mock", ...profile.ai, ...patch } as AISettings });
  const ai = profile.ai ?? { id: "mock" as const };
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  async function fetchModels() {
    if (ai.id !== "ollama") return;
    setModelsLoading(true);
    try {
      const baseUrl = ai.ollama?.baseUrl;
      const q = baseUrl ? "?baseUrl=" + encodeURIComponent(baseUrl) : "";
      const r = await fetch("/api/ai/ollama/health" + q);
      if (!r.ok) {
        setModels([]);
        return;
      }
      const data = await r.json();
      setModels(Array.isArray(data?.models) ? data.models : []);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.id, ai.ollama?.baseUrl]);

  return (
    <div className="status-pop" role="dialog">
      <label>
        <span>行間</span>
        <input
          type="range"
          min={1.2}
          max={2.4}
          step={0.05}
          value={profile.lineHeight}
          onChange={(e) => set({ lineHeight: Number(e.target.value) })}
        />
        <span className="val">{profile.lineHeight.toFixed(2)}</span>
      </label>
      <label>
        <span>テーマ</span>
        <select value={profile.theme} onChange={(e) => set({ theme: e.target.value as Profile["theme"] })}>
          <option value="system">system</option>
          <option value="light">light</option>
          <option value="sepia">sepia</option>
          <option value="dark">dark</option>
          <option value="oled">deep dark (OLED)</option>
        </select>
      </label>
      <label>
        <span>AI</span>
        <select value={ai.id} onChange={(e) => setAi({ id: e.target.value as AISettings["id"] })}>
          <option value="mock">Mock</option>
          <option value="ollama">Ollama</option>
          <option value="chrome">Chrome (Gemini Nano)</option>
          <option value="local-llm">ローカルAI(オンデバイス)</option>
        </select>
      </label>
      <label>
        <span>送信キー</span>
        <select
          value={profile.aiSendKey || "enter"}
          onChange={(e) => set({ aiSendKey: e.target.value as AISendKey })}
        >
          <option value="enter">Enter</option>
          <option value="ctrl-enter">⌘/Ctrl + Enter</option>
        </select>
      </label>
      {ai.id === "ollama" && (
        <label>
          <span>model</span>
          <select
            value={ai.ollama?.model || ""}
            onChange={(e) => setAi({ ollama: { ...ai.ollama, model: e.target.value } })}
            disabled={modelsLoading || models.length === 0}
          >
            {models.length === 0 && (
              <option value="">{modelsLoading ? "読み込み中…" : "（モデルなし）"}</option>
            )}
            {ai.ollama?.model && !models.includes(ai.ollama.model) && (
              <option value={ai.ollama.model}>{ai.ollama.model}（未検出）</option>
            )}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ai-reload"
            onClick={fetchModels}
            title="モデル一覧を再取得"
            disabled={modelsLoading}
          >
            ⟳
          </button>
        </label>
      )}
      <label>
        <span>メモ→提案</span>
        <input
          type="checkbox"
          checked={!!profile.memoSuggestEnabled}
          onChange={(e) => set({ memoSuggestEnabled: e.target.checked })}
          title="改行確定時にAIへ送り、本文に差し込み提案を出す（原稿がある時のみ）"
        />
      </label>
      <label>
        <span>自動執筆（実験）</span>
        <input
          type="checkbox"
          checked={!!profile.memoAutoWriteEnabled}
          onChange={(e) => set({ memoAutoWriteEnabled: e.target.checked })}
          title="メモを書き始めると、AIが原稿を生成・更新し続けます"
        />
      </label>
      <button
        className={"ai-status " + (aiStatus.ok ? "ok" : "ng")}
        onClick={onRecheckAI}
        title="AI 接続を再確認"
      >
        ● {aiStatus.label}
      </button>
    </div>
  );
}
