import { useEffect, useState } from "react";
import type { AISettings, Profile } from "../lib/types";

interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  aiStatus: { ok: boolean; label: string };
  onRecheckAI: () => void;
}

export function SettingsBar({ profile, onChange, focusMode, onToggleFocus, aiStatus, onRecheckAI }: Props) {
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
    <div className="settings">
      <label>
        サイズ
        <input
          type="range"
          min={12}
          max={28}
          value={profile.fontSize}
          onChange={(e) => set({ fontSize: Number(e.target.value) })}
        />
        <span className="val">{profile.fontSize}px</span>
        {profile.longUsedFontSize != null && profile.longUsedFontSize !== profile.fontSize && (
          <button
            type="button"
            className="zoom-restore"
            title={`元のサイズ ${profile.longUsedFontSize}px に戻す`}
            onClick={() => set({ fontSize: profile.longUsedFontSize! })}
          >
            ↩{profile.longUsedFontSize}
          </button>
        )}
      </label>
      <label>
        行間
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
        テーマ
        <select value={profile.theme} onChange={(e) => set({ theme: e.target.value as Profile["theme"] })}>
          <option value="system">system</option>
          <option value="light">light</option>
          <option value="sepia">sepia</option>
          <option value="dark">dark</option>
        </select>
      </label>
      <label>
        モード
        <select value={profile.mode} onChange={(e) => set({ mode: e.target.value as Profile["mode"] })}>
          <option value="draft">草稿</option>
          <option value="edit">編集</option>
        </select>
      </label>
      <label>
        AI
        <select
          value={ai.id}
          onChange={(e) => setAi({ id: e.target.value as AISettings["id"] })}
        >
          <option value="mock">Mock</option>
          <option value="ollama">Ollama</option>
        </select>
      </label>
      {ai.id === "ollama" && (
        <label>
          model
          <select
            value={ai.ollama?.model || ""}
            onChange={(e) => setAi({ ollama: { ...ai.ollama, model: e.target.value } })}
            disabled={modelsLoading || models.length === 0}
            style={{ maxWidth: 180 }}
          >
            {models.length === 0 && (
              <option value="">{modelsLoading ? "読み込み中…" : "（モデルなし）"}</option>
            )}
            {/* 現在のモデルがリストに無くても選択肢として残す */}
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
      <button
        className={"ai-status " + (aiStatus.ok ? "ok" : "ng")}
        onClick={onRecheckAI}
        title="AI 接続を再確認"
      >
        ● {aiStatus.label}
      </button>
      <button
        className={"focus-toggle " + (focusMode ? "on" : "")}
        onClick={onToggleFocus}
        title="集中モード (F8)"
      >
        {focusMode ? "通常表示" : "集中"}
      </button>
    </div>
  );
}
