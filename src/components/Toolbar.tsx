import { useEffect, useRef, useState } from "react";
import { SettingsPopover } from "./SettingsPopover";
import type { Profile } from "../lib/types";

export interface ToolbarHandlers {
  newDoc: () => void;
  openFile: () => void;
  exportFile: () => void;
  deleteDoc: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
  openFind: () => void;
  openReplace: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  separator?: false;
}
interface Separator {
  separator: true;
}
type Entry = MenuItem | Separator;

interface ToolbarProps {
  handlers: ToolbarHandlers;
  profile: Profile;
  onChangeProfile: (p: Profile) => void;
  aiStatus: { ok: boolean; label: string };
  onRecheckAI: () => void;
}

export function Toolbar({ handlers, profile, onChangeProfile, aiStatus, onRecheckAI }: ToolbarProps) {
  const [open, setOpen] = useState<null | "file" | "edit" | "settings">(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const meta = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";

  const fileMenu: Entry[] = [
    { label: "新規", shortcut: `${meta}+N`, onClick: handlers.newDoc },
    { label: "開く（テキストを取り込み）", shortcut: `${meta}+O`, onClick: handlers.openFile },
    { label: "書き出し", shortcut: `${meta}+E`, onClick: handlers.exportFile },
    { separator: true },
    { label: "現在の原稿を削除", onClick: handlers.deleteDoc },
  ];
  const editMenu: Entry[] = [
    { label: "元に戻す", shortcut: `${meta}+Z`, onClick: handlers.undo },
    { label: "やり直し", shortcut: `${meta}+Shift+Z`, onClick: handlers.redo },
    { separator: true },
    { label: "切り取り", shortcut: `${meta}+X`, onClick: handlers.cut },
    { label: "コピー", shortcut: `${meta}+C`, onClick: handlers.copy },
    { label: "貼り付け", shortcut: `${meta}+V`, onClick: handlers.paste },
    { label: "すべて選択", shortcut: `${meta}+A`, onClick: handlers.selectAll },
    { separator: true },
    { label: "検索", shortcut: `${meta}+F`, onClick: handlers.openFind },
    { label: "置換", shortcut: `${meta}+H`, onClick: handlers.openReplace },
  ];

  function pickHandler(handler: () => void) {
    return () => {
      setOpen(null);
      handler();
    };
  }

  return (
    <div className="toolbar" ref={rootRef}>
      <button
        type="button"
        className={"toolbar-btn" + (open === "file" ? " active" : "")}
        onClick={() => setOpen((v) => (v === "file" ? null : "file"))}
      >
        ファイル
      </button>
      <button
        type="button"
        className={"toolbar-btn" + (open === "edit" ? " active" : "")}
        onClick={() => setOpen((v) => (v === "edit" ? null : "edit"))}
      >
        編集
      </button>
      <button
        type="button"
        className={"toolbar-btn" + (open === "settings" ? " active" : "")}
        onClick={() => setOpen((v) => (v === "settings" ? null : "settings"))}
        title="表示・テーマ・AI 接続"
      >
        表示
      </button>
      {open === "file" && <Dropdown entries={fileMenu} pick={pickHandler} />}
      {open === "edit" && (
        <Dropdown entries={editMenu} pick={pickHandler} style={{ left: 80 }} />
      )}
      {open === "settings" && (
        <div className="toolbar-menu toolbar-menu-settings" style={{ left: 152 }} role="menu">
          <SettingsPopover
            profile={profile}
            onChange={onChangeProfile}
            aiStatus={aiStatus}
            onRecheckAI={onRecheckAI}
          />
        </div>
      )}
    </div>
  );
}

function Dropdown({
  entries,
  pick,
  style,
}: {
  entries: Entry[];
  pick: (h: () => void) => () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="toolbar-menu" style={style} role="menu">
      {entries.map((e, i) =>
        "separator" in e ? (
          <div key={i} className="toolbar-sep" />
        ) : (
          <button key={i} type="button" className="toolbar-item" onClick={pick(e.onClick)}>
            <span className="toolbar-item-label">{e.label}</span>
            {e.shortcut && <span className="toolbar-item-shortcut">{e.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
}
