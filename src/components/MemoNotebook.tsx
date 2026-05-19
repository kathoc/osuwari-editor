import { useEffect, useMemo, useRef } from "react";

export interface AppliedSentence {
  id: string;
  sentence: string;
  docRange: { start: number; end: number };
  createdAt: number;
}

interface Props {
  text: string;
  applied: AppliedSentence[];
  busy?: boolean;
  onChange: (text: string) => void;
  onCommitLine: (line: string) => void;
  onClickApplied: (a: AppliedSentence) => void;
  onCompileAll?: () => void;
  onSendToAI?: () => void;
  suggestMode?: boolean;
}

interface Mark {
  start: number;
  end: number;
  id: string;
}

export function MemoNotebook({ text, applied, busy, onChange, onCommitLine, onClickApplied, onCompileAll, onSendToAI, suggestMode }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const marks = useMemo<Mark[]>(() => computeMarks(text, applied), [text, applied]);

  useEffect(() => {
    // overlay とエディタのスクロールを同期
    if (overlayRef.current && taRef.current) {
      overlayRef.current.scrollTop = taRef.current.scrollTop;
    }
  }, [text]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if ((e.nativeEvent as any).isComposing) return;
    // Enter のデフォルト動作（改行挿入）を許可しつつ、次フレームで直前行を取り出す
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      const pos = ta.selectionStart;
      const v = ta.value;
      const lineEnd = pos - 1; // ここが \n
      if (lineEnd < 0 || v[lineEnd] !== "\n") return;
      let lineStart = v.lastIndexOf("\n", lineEnd - 1);
      lineStart = lineStart === -1 ? 0 : lineStart + 1;
      const line = v.slice(lineStart, lineEnd).trim();
      if (!line) return;
      // 既に反映済みの行は再送しない
      if (applied.some((a) => a.sentence === line)) return;
      onCommitLine(line);
    });
  }

  function onMouseUp(e: React.MouseEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    const pos = ta.selectionStart;
    // クリック位置が反映済みマーク内なら、対応する applied を返す
    const hit = marks.find((m) => pos >= m.start && pos <= m.end);
    if (!hit) return;
    const target = applied.find((a) => a.id === hit.id);
    if (target) onClickApplied(target);
  }

  return (
    <div className="memoboard">
      <div className="memoboard-head">
        <span>メモ</span>
        <span className="memoboard-hint">
          {busy
            ? "生成中…"
            : suggestMode
            ? "改行でAIが差し込み提案を生成 · Shift+Enterで改行のみ"
            : "改行で原稿に反映 · Shift+Enterで改行のみ"}
        </span>
        {onSendToAI && (
          <button
            className="memoboard-compile"
            onClick={onSendToAI}
            disabled={busy || !text.trim()}
            title="メモ全体をプロンプトとしてAIタブに送る"
          >
            AIへ送る
          </button>
        )}
        {onCompileAll && (
          <button
            className="memoboard-compile"
            onClick={onCompileAll}
            disabled={busy || !text.trim()}
            title="メモ全体を本文化して末尾に追記"
          >
            全文を原稿化
          </button>
        )}
      </div>
      <div className="memoboard-wrap">
        <div ref={overlayRef} className="memoboard-overlay" aria-hidden>
          {renderMarked(text, marks)}
        </div>
        <textarea
          ref={taRef}
          className="memoboard-textarea"
          value={text}
          placeholder="ここに走り書き。改行するたびに、原稿の該当箇所へ自動反映します。"
          spellCheck={false}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onMouseUp={onMouseUp}
          onScroll={(e) => {
            if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
        />
      </div>
    </div>
  );
}

function computeMarks(text: string, applied: AppliedSentence[]): Mark[] {
  const marks: Mark[] = [];
  for (const a of applied) {
    if (!a.sentence) continue;
    let from = 0;
    while (true) {
      const i = text.indexOf(a.sentence, from);
      if (i === -1) break;
      marks.push({ start: i, end: i + a.sentence.length, id: a.id });
      from = i + a.sentence.length;
    }
  }
  // overlap を解消（先勝ち）
  marks.sort((a, b) => a.start - b.start);
  const out: Mark[] = [];
  let cursor = -1;
  for (const m of marks) {
    if (m.start >= cursor) {
      out.push(m);
      cursor = m.end;
    }
  }
  return out;
}

function renderMarked(text: string, marks: Mark[]) {
  if (marks.length === 0) return <span>{text + "\n "}</span>;
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (let k = 0; k < marks.length; k++) {
    const m = marks[k];
    if (m.start > i) parts.push(<span key={`t${k}`}>{text.slice(i, m.start)}</span>);
    parts.push(
      <mark key={`m${k}`} className="memoboard-mark" data-id={m.id}>
        {text.slice(m.start, m.end)}
      </mark>
    );
    i = m.end;
  }
  if (i < text.length) parts.push(<span key="tail">{text.slice(i)}</span>);
  parts.push(<span key="sentinel">{"\n "}</span>);
  return <>{parts}</>;
}
