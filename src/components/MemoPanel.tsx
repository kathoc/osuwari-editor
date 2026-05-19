import { useEffect, useRef, useState } from "react";
import type { MemoLine } from "../lib/types";

interface Props {
  memos: MemoLine[];
  onSubmitLine: (text: string) => void;
  onClickApplied: (memo: MemoLine) => void;
  onRemove: (id: string) => void;
}

export function MemoPanel({ memos, onSubmitLine, onClickApplied, onRemove }: Props) {
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 自動リサイズ
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [draft]);

  // 新規メモが増えたら最下部へ
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [memos.length]);

  function submitCurrentLines() {
    const raw = draft;
    if (!raw.trim()) return;
    // 複数行で確定された場合、空行で区切って1メモ単位にする
    const items = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    for (const it of items) onSubmitLine(it);
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter で送信、Shift+Enter で改行
    // IME 入力中は確定しない（nativeEvent.isComposing で判定）
    if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
      e.preventDefault();
      submitCurrentLines();
    }
  }

  return (
    <div className="memo">
      <div className="memo-head">
        メモ
        <span className="memo-hint">Enter で反映 · Shift+Enter で改行</span>
      </div>
      <div ref={listRef} className="memo-list">
        {memos.length === 0 && (
          <div className="memo-empty">
            ここに走り書きすると、関係しそうな箇所に自動で反映します。
          </div>
        )}
        {memos.map((m) => (
          <div
            key={m.id}
            className={"memo-item s-" + m.status}
            onClick={() => m.status === "applied" && onClickApplied(m)}
            title={m.status === "applied" ? "クリックで該当箇所をハイライト" : ""}
          >
            <span className={"memo-check " + m.status}>
              {m.status === "applied" ? "☑" : m.status === "failed" ? "！" : "□"}
            </span>
            <span className="memo-text">{m.text}</span>
            {m.applied && (
              <span className={"memo-mode mode-" + m.applied.mode}>
                {m.applied.mode === "replace" ? "書き換え" : m.applied.mode === "append" ? "補強" : "追加"}
              </span>
            )}
            <button
              className="memo-x"
              title="削除"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(m.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="memo-input">
        <textarea
          ref={taRef}
          rows={2}
          value={draft}
          placeholder="例: 結論を一文で／導入をやわらかく／○○について追記"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button onClick={submitCurrentLines} disabled={!draft.trim()}>
          反映
        </button>
      </div>
    </div>
  );
}
