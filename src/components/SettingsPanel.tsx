import { useEffect, useState } from "react";
import type { DocumentSettings, EffectiveSettings, Profile, Project, ProjectSummary, StyleRule } from "../lib/types";
import { STYLE_RULE_LABEL } from "../lib/settings";
import {
  getLocalLlmBridge,
  hasLocalLlmBridge,
  type LocalLlmProgress,
  type LocalLlmStatus,
} from "../lib/ai/localLlm";

interface Props {
  // current file
  docId: string;
  docTitle: string;
  docSettings: DocumentSettings | null | undefined;
  projectId: string | null | undefined;
  effective: EffectiveSettings;
  // project list and current project full
  projects: ProjectSummary[];
  currentProject: Project | null;
  // callbacks
  onChangeDocSettings: (next: DocumentSettings | null) => void;
  onChangeProjectId: (next: string | null) => void;
  onCreateProject: (name: string) => Promise<Project | null>;
  onUpdateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  // 助手草稿（メモ駆動オート草稿）の設定
  profile: Profile;
  onChangeProfile: (next: Profile) => void;
}

const STYLE_OPTIONS: { value: StyleRule; label: string }[] = [
  { value: "off", label: STYLE_RULE_LABEL.off },
  { value: "desu-masu", label: STYLE_RULE_LABEL["desu-masu"] },
  { value: "da-dearu", label: STYLE_RULE_LABEL["da-dearu"] },
  { value: "dayo-nanda", label: STYLE_RULE_LABEL["dayo-nanda"] },
];

export function SettingsPanel(props: Props) {
  const {
    docId,
    docTitle,
    docSettings,
    projectId,
    effective,
    projects,
    currentProject,
    onChangeDocSettings,
    onChangeProjectId,
    onCreateProject,
    onUpdateProject,
    onDeleteProject,
    profile,
    onChangeProfile,
  } = props;

  const [projName, setProjName] = useState(currentProject?.name || "");
  useEffect(() => {
    setProjName(currentProject?.name || "");
  }, [currentProject?.id, currentProject?.name]);

  // doc 設定: undefined or null は「プロジェクト/既定に従う」
  const docRuby = docSettings?.rubyVisible;
  const docStyle = docSettings?.styleRule;

  const setDoc = (patch: Partial<DocumentSettings>) => {
    const merged: DocumentSettings = { ...(docSettings || {}), ...patch };
    // すべて null/undefined になったら settings 自体を null に
    if ((merged.rubyVisible === undefined || merged.rubyVisible === null) &&
        (merged.styleRule === undefined || merged.styleRule === null)) {
      onChangeDocSettings(null);
    } else {
      onChangeDocSettings(merged);
    }
  };

  return (
    <div className="setpanel">
      <div className="setpanel-section">
        <div className="setpanel-head">このファイル</div>
        <div className="setpanel-subtle">
          {docTitle || "無題"} <span className="setpanel-id">#{docId.slice(0, 6)}</span>
        </div>

        <label className="setpanel-row">
          <span>所属プロジェクト</span>
          <select
            value={projectId || ""}
            onChange={(e) => onChangeProjectId(e.target.value || null)}
          >
            <option value="">（なし）</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="setpanel-row">
          <span>ルビ表示</span>
          <select
            value={docRuby === undefined || docRuby === null ? "inherit" : docRuby ? "on" : "off"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "inherit") setDoc({ rubyVisible: null });
              else setDoc({ rubyVisible: v === "on" });
            }}
          >
            <option value="inherit">継承（{effective.rubyVisible ? "表示" : "非表示"}）</option>
            <option value="on">表示</option>
            <option value="off">非表示</option>
          </select>
        </label>

        <label className="setpanel-row">
          <span>文体ルール</span>
          <select
            value={docStyle === undefined || docStyle === null ? "inherit" : docStyle}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "inherit") setDoc({ styleRule: null });
              else setDoc({ styleRule: v as StyleRule });
            }}
          >
            <option value="inherit">継承（{STYLE_RULE_LABEL[effective.styleRule]}）</option>
            {STYLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <div className="setpanel-effective">
          実効: ルビ {effective.rubyVisible ? "表示" : "非表示"}（{srcLabel(effective.source.rubyVisible)}）
          / 文体 {STYLE_RULE_LABEL[effective.styleRule]}（{srcLabel(effective.source.styleRule)}）
        </div>
      </div>

      <div className="setpanel-section">
        <div className="setpanel-head">プロジェクト</div>
        {!currentProject ? (
          <div className="setpanel-subtle">所属プロジェクトを選ぶと、ここに既定値が表示されます。</div>
        ) : (
          <>
            <label className="setpanel-row">
              <span>名前</span>
              <input
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                onBlur={() => {
                  if (projName.trim() && projName !== currentProject.name) {
                    onUpdateProject(currentProject.id, { name: projName.trim() });
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </label>
            <label className="setpanel-row">
              <span>ルビ表示（既定）</span>
              <select
                value={currentProject.rubyVisible ? "on" : "off"}
                onChange={(e) => onUpdateProject(currentProject.id, { rubyVisible: e.target.value === "on" })}
              >
                <option value="on">表示</option>
                <option value="off">非表示</option>
              </select>
            </label>
            <label className="setpanel-row">
              <span>文体ルール（既定）</span>
              <select
                value={currentProject.styleRule}
                onChange={(e) => onUpdateProject(currentProject.id, { styleRule: e.target.value as StyleRule })}
              >
                {STYLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <div className="setpanel-actions">
              <button
                className="setpanel-danger"
                onClick={() => {
                  if (confirm(`プロジェクト「${currentProject.name}」を削除しますか？所属ファイルは "なし" になります。`)) {
                    onDeleteProject(currentProject.id);
                  }
                }}
              >
                プロジェクトを削除
              </button>
            </div>
          </>
        )}
      </div>

      <div className="setpanel-section">
        <div className="setpanel-head">助手草稿（メモから草稿）</div>
        <label className="setpanel-row">
          <span>メモから草稿候補を作る</span>
          <select
            value={profile.memoDraftEnabled ? "on" : "off"}
            onChange={(e) => onChangeProfile({ ...profile, memoDraftEnabled: e.target.value === "on" })}
          >
            <option value="off">OFF</option>
            <option value="on">ON</option>
          </select>
        </label>
        <label className="setpanel-row">
          <span>草稿の勢い</span>
          <select
            value={profile.memoDraftMode || "normal"}
            onChange={(e) => onChangeProfile({ ...profile, memoDraftMode: e.target.value as "safe" | "normal" | "wild" })}
            disabled={!profile.memoDraftEnabled}
          >
            <option value="safe">控えめ</option>
            <option value="normal">標準</option>
            <option value="wild">ふくらませる</option>
          </select>
        </label>
        <div className="setpanel-subtle">
          ONにすると、メモを改行確定するたびに、AIが荒い下書きカードを生成します。本文には自動反映されず、採用ボタンを押した時だけ末尾に追記されます。
        </div>
      </div>

      <LocalLlmSection profile={profile} onChangeProfile={onChangeProfile} />

      <div className="setpanel-section">
        <div className="setpanel-head">新規プロジェクト</div>
        <NewProjectRow onCreate={onCreateProject} />
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(0) + " MB";
  return Math.round(n / 1024) + " KB";
}

function LocalLlmSection({ profile, onChangeProfile }: { profile: Profile; onChangeProfile: (p: Profile) => void }) {
  const [status, setStatus] = useState<LocalLlmStatus | null>(null);
  const [progress, setProgress] = useState<LocalLlmProgress | null>(null);

  useEffect(() => {
    if (!hasLocalLlmBridge()) return;
    const bridge = getLocalLlmBridge();
    if (!bridge) return;
    let cancelled = false;
    bridge.status().then((s) => {
      if (!cancelled) setStatus(s);
    });
    const off = bridge.onProgress((p) => {
      setProgress(p);
      if (p.status === "done" || p.status === "cancelled" || p.status === "error") {
        bridge.status().then((s) => setStatus(s));
        if (p.status === "done") {
          // 初回導入直後、ユーザーが未選択なら自動でローカルAIに切替
          onChangeProfile(profile.ai ? profile : { ...profile, ai: { id: "local-llm" } });
        }
      }
    });
    return () => {
      cancelled = true;
      off();
    };
    // 依存は profile.ai のみで十分（onChangeProfile/profile丸ごとは循環の元）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.ai?.id]);

  if (!hasLocalLlmBridge()) {
    return null;
  }

  const installed = !!status?.installed;
  const downloading = !!status?.downloading || progress?.status === "downloading";
  const expected = status?.expectedSizeBytes || 0;
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.floor((progress.received / progress.total) * 100))
      : 0;

  async function refresh() {
    const bridge = getLocalLlmBridge();
    if (!bridge) return;
    const s = await bridge.status();
    setStatus(s);
  }
  async function startDl() {
    const bridge = getLocalLlmBridge();
    if (!bridge) return;
    setProgress({ status: "downloading", received: 0, total: expected });
    const r = await bridge.startDownload();
    if (!r.ok) setProgress({ status: "error", received: 0, total: expected, error: r.reason || "unknown" });
    await refresh();
  }
  async function cancelDl() {
    const bridge = getLocalLlmBridge();
    if (!bridge) return;
    await bridge.cancelDownload();
    await refresh();
  }
  async function deleteModel() {
    const bridge = getLocalLlmBridge();
    if (!bridge) return;
    if (!confirm("ローカルAIのモデルファイルを削除しますか？")) return;
    await bridge.deleteModel();
    await refresh();
    setProgress(null);
  }

  const aiId = profile.ai?.id || "mock";

  return (
    <div className="setpanel-section">
      <div className="setpanel-head">ローカルAI(オンデバイス)</div>
      <div className="setpanel-subtle">
        外部送信せずにデバイス上で動くAIです。容量は約 <b>{formatBytes(expected)}</b> です。
      </div>

      <div className="setpanel-local-llm-status">
        状態: {downloading ? "ダウンロード中" : installed ? "導入済み" : "未導入"}
        {status && installed && !downloading && <> （{formatBytes(status.sizeBytes)}）</>}
      </div>

      {progress && (
        <div className="local-llm-progress">
          <div className="local-llm-progress-bar">
            <div className="local-llm-progress-fill" style={{ width: pct + "%" }} />
          </div>
          <div className="local-llm-progress-meta">
            {progress.status === "downloading" && (
              <>
                {pct}% ({formatBytes(progress.received)} / {formatBytes(progress.total)})
              </>
            )}
            {progress.status === "done" && <>完了しました。</>}
            {progress.status === "cancelled" && <>中断しました。</>}
            {progress.status === "error" && <>エラー: {progress.error}</>}
          </div>
        </div>
      )}

      <div className="setpanel-local-llm-row">
        {downloading ? (
          <button onClick={cancelDl}>ダウンロードを中止</button>
        ) : installed ? (
          <button onClick={deleteModel}>モデルを削除</button>
        ) : (
          <button className="primary" onClick={startDl}>ダウンロードする</button>
        )}
      </div>

      <label className="setpanel-row" style={{ marginTop: 12 }}>
        <span>使用するAI</span>
        <select
          value={aiId}
          onChange={(e) => onChangeProfile({ ...profile, ai: { id: e.target.value as NonNullable<Profile["ai"]>["id"] } })}
        >
          <option value="mock">Mock</option>
          <option value="ollama">Ollama</option>
          <option value="chrome">Chrome (Gemini Nano)</option>
          <option value="local-llm" disabled={!installed}>
            ローカルAI(オンデバイス){installed ? "" : "（未導入）"}
          </option>
        </select>
      </label>
    </div>
  );
}

function NewProjectRow({ onCreate }: { onCreate: (name: string) => Promise<Project | null> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const p = await onCreate(n);
      if (p) setName("");
    } finally { setBusy(false); }
  }
  return (
    <div className="setpanel-row setpanel-newproj">
      <input
        value={name}
        placeholder="プロジェクト名"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !(e.nativeEvent as any).isComposing) go(); }}
        disabled={busy}
      />
      <button onClick={go} disabled={busy || !name.trim()}>作成</button>
    </div>
  );
}

function srcLabel(s: "doc" | "project" | "default"): string {
  return s === "doc" ? "ファイル" : s === "project" ? "プロジェクト" : "既定";
}
