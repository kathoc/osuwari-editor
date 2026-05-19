import { useEffect, useState } from "react";
import type { DocumentSettings, EffectiveSettings, Profile, Project, ProjectSummary, StyleRule } from "../lib/types";
import { STYLE_RULE_LABEL } from "../lib/settings";

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

      <div className="setpanel-section">
        <div className="setpanel-head">新規プロジェクト</div>
        <NewProjectRow onCreate={onCreateProject} />
      </div>
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
