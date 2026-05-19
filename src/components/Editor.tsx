import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Highlight } from "../lib/types";
import type { RubyReading } from "../lib/analyze";

interface FlashRange {
  start: number;
  end: number;
  token: number;
}

interface Props {
  value: string;
  onChange: (next: string, cursor: number) => void;
  onCursor: (cursor: number) => void;
  onScroll: (scrollTop: number) => void;
  onSelectionChange?: (sel: { start: number; end: number; text: string } | null) => void;
  fontSize: number;
  lineHeight: number;
  highlights: Highlight[];
  initialCursor: number;
  initialScrollTop: number;
  flashRange?: FlashRange | null;
  rubyVisible?: boolean;
  rubyReadings?: RubyReading[];
}

export interface EditorHandle {
  focus(): void;
  getSelection(): { start: number; end: number };
  setSelectionRange(start: number, end: number): void;
  exec(cmd: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll"): Promise<void> | void;
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  {
    value,
    onChange,
    onCursor,
    onScroll,
    onSelectionChange,
    fontSize,
    lineHeight,
    highlights,
    initialCursor,
    initialScrollTop,
    flashRange,
    rubyVisible = true,
    rubyReadings = [],
  },
  apiRef
) {
  // ルビ表示が ON のときは、ハイライト側からはルビ用マークを取り除く
  // （本格的なルビ描画は ruby overlay で行う）
  const visibleHighlights = rubyVisible
    ? highlights.filter((h) => h.kind !== "ruby")
    : highlights.filter((h) => h.kind !== "ruby");
  const activeRubies = rubyVisible ? rubyReadings : [];
  const ref = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rubyOverlayRef = useRef<HTMLDivElement>(null);
  const shadowSelRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const [shadowSel, setShadowSel] = useState<{ start: number; end: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [hlTip, setHlTip] = useState<{ x: number; y: number; message: string; suggestion: string } | null>(null);

  const reportSel = (el: HTMLTextAreaElement) => {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (end > start) {
      setShadowSel({ start, end });
      if (onSelectionChange) onSelectionChange({ start, end, text: el.value.slice(start, end) });
    } else {
      setShadowSel(null);
      if (onSelectionChange) onSelectionChange(null);
    }
  };

  useImperativeHandle(apiRef, () => ({
    focus() {
      ref.current?.focus();
    },
    getSelection() {
      const el = ref.current;
      if (!el) return { start: 0, end: 0 };
      return { start: el.selectionStart, end: el.selectionEnd };
    },
    setSelectionRange(start, end) {
      const el = ref.current;
      if (!el) return;
      try {
        el.focus();
        el.setSelectionRange(start, end);
      } catch {}
    },
    async exec(cmd) {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (cmd === "selectAll") {
        el.setSelectionRange(0, el.value.length);
        reportSel(el);
        return;
      }
      if (cmd === "paste") {
        try {
          const text = await navigator.clipboard.readText();
          const s = el.selectionStart;
          const e = el.selectionEnd;
          const next = el.value.slice(0, s) + text + el.value.slice(e);
          onChange(next, s + text.length);
          requestAnimationFrame(() => {
            const el2 = ref.current;
            if (el2) el2.setSelectionRange(s + text.length, s + text.length);
          });
          return;
        } catch {
          // fallback to execCommand
        }
      }
      if (cmd === "cut" || cmd === "copy") {
        const s = el.selectionStart;
        const e = el.selectionEnd;
        if (e > s) {
          try {
            await navigator.clipboard.writeText(el.value.slice(s, e));
            if (cmd === "cut") {
              const next = el.value.slice(0, s) + el.value.slice(e);
              onChange(next, s);
            }
            return;
          } catch {
            // fallback to execCommand
          }
        }
      }
      try {
        document.execCommand(cmd);
      } catch {}
    },
  }));

  useEffect(() => {
    if (restored.current) return;
    const el = ref.current;
    if (!el) return;
    const pos = initialCursor > 0 ? initialCursor : el.value.length;
    el.focus();
    try {
      el.setSelectionRange(pos, pos);
    } catch {}
    el.scrollTop = initialScrollTop;
    restored.current = true;
  }, [initialCursor, initialScrollTop]);

  useEffect(() => {
    if (!flashRange) return;
    const el = ref.current;
    if (!el) return;
    const start = Math.max(0, Math.min(flashRange.start, value.length));
    const end = Math.max(start, Math.min(flashRange.end, value.length));
    try {
      el.focus({ preventScroll: true });
      el.setSelectionRange(start, end);
    } catch {}
    const lh = fontSize * lineHeight;
    const linesBefore = (value.slice(0, start).match(/\n/g) || []).length;
    const targetY = linesBefore * lh;
    const desired = Math.max(0, targetY - el.clientHeight / 2);
    el.scrollTop = desired;
    if (overlayRef.current) overlayRef.current.scrollTop = desired;
    if (rubyOverlayRef.current) rubyOverlayRef.current.scrollTop = desired;
    if (shadowSelRef.current) shadowSelRef.current.scrollTop = desired;

    const wrap = el.parentElement;
    if (wrap) {
      wrap.classList.remove("flash");
      void wrap.offsetWidth;
      wrap.classList.add("flash");
      const t = window.setTimeout(() => wrap.classList.remove("flash"), 900);
      return () => window.clearTimeout(t);
    }
  }, [flashRange?.token]);

  return (
    <div
      className="editor-wrap"
      style={{ fontSize, lineHeight }}
      onMouseMove={(e) => {
        const overlay = overlayRef.current;
        if (!overlay) return;
        const marks = overlay.querySelectorAll<HTMLElement>("mark.hl");
        for (let i = 0; i < marks.length; i++) {
          const m = marks[i];
          const rects = m.getClientRects();
          for (let r = 0; r < rects.length; r++) {
            const rect = rects[r];
            if (
              e.clientX >= rect.left &&
              e.clientX < rect.right &&
              e.clientY >= rect.top &&
              e.clientY < rect.bottom
            ) {
              const msg = m.getAttribute("data-msg") || "";
              const sg = m.getAttribute("data-suggest") || "";
              setHlTip({ x: e.clientX, y: e.clientY, message: msg, suggestion: sg });
              return;
            }
          }
        }
        if (hlTip) setHlTip(null);
      }}
      onMouseLeave={() => setHlTip(null)}
    >
      <div
        ref={shadowSelRef}
        className={"editor-shadow-sel" + (focused ? " hidden" : "")}
        aria-hidden
      >
        {renderShadowSelection(value, shadowSel)}
      </div>
      <div ref={overlayRef} className="editor-overlay" aria-hidden>
        {renderHighlighted(value, visibleHighlights)}
      </div>
      {activeRubies.length > 0 && (
        <div ref={rubyOverlayRef} className="editor-ruby-overlay" aria-hidden>
          {renderRuby(value, activeRubies)}
        </div>
      )}
      <textarea
        ref={ref}
        className="editor-textarea"
        value={value}
        spellCheck={false}
        onChange={(e) => {
          const el = e.currentTarget;
          onChange(el.value, el.selectionStart);
        }}
        onKeyUp={(e) => {
          onCursor(e.currentTarget.selectionStart);
          reportSel(e.currentTarget);
        }}
        onClick={(e) => {
          onCursor(e.currentTarget.selectionStart);
          reportSel(e.currentTarget);
        }}
        onSelect={(e) => reportSel(e.currentTarget)}
        onMouseUp={(e) => reportSel(e.currentTarget)}
        onScroll={(e) => {
          const st = e.currentTarget.scrollTop;
          if (overlayRef.current) overlayRef.current.scrollTop = st;
          if (rubyOverlayRef.current) rubyOverlayRef.current.scrollTop = st;
          if (shadowSelRef.current) shadowSelRef.current.scrollTop = st;
          onScroll(st);
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          setFocused(false);
          reportSel(e.currentTarget);
        }}
        placeholder=""
      />
      {value.length === 0 && !focused && (
        <div className="editor-empty" aria-hidden>
          <p className="editor-empty-title">ここから書きはじめてください</p>
          <p className="editor-empty-sub">
            <b>下書きメモ</b> に走り書きすると、改行ごとに原稿へ取り込まれます。
          </p>
          <ul className="editor-empty-keys">
            <li><kbd>⌘N</kbd> 新規</li>
            <li><kbd>⌘O</kbd> 取り込み</li>
            <li><kbd>⌘F</kbd> 検索</li>
            <li><kbd>F8</kbd> 集中モード</li>
          </ul>
        </div>
      )}
      {hlTip && (
        <div
          className="hl-tooltip"
          style={{ left: hlTip.x + 12, top: hlTip.y + 16 }}
          role="tooltip"
        >
          <div className="hl-tooltip-msg">{hlTip.message}</div>
          {hlTip.suggestion && (
            <div className="hl-tooltip-suggest">💡 {hlTip.suggestion}</div>
          )}
        </div>
      )}
    </div>
  );
});

function renderShadowSelection(text: string, sel: { start: number; end: number } | null) {
  if (!sel || sel.end <= sel.start) return <span>{text}</span>;
  const s = Math.max(0, Math.min(sel.start, text.length));
  const e = Math.max(s, Math.min(sel.end, text.length));
  return (
    <>
      <span>{text.slice(0, s)}</span>
      <mark className="shadow-sel">{text.slice(s, e)}</mark>
      <span>{text.slice(e)}</span>
      <span>{"\n "}</span>
    </>
  );
}

// 各 reading を「単漢字 1 ルビ」の細かい segment 列に分解して、それぞれを
// 独立した <ruby> として描画する。これにより、「大切」のような複合語が
// 折り返しで泣き別れても 大（たい）/ 切（せつ）と各漢字の上に正しくルビが残る。
//
// 長体ルール（仕様）:
//   - rt の自然幅が base 幅を超える場合のみ、scaleX(ratio) で水平方向に圧縮
//   - ratio = base / content の自然比、最大 50%（つまり ratio >= 0.5）
//   - rt の layout 幅は base と同じ「baseChars * 1em（親 em）」に固定するため、
//     内部に inline-block の wrapper span を入れて width/font-size を制御。
//     これにより、rt がどれだけ長くても <ruby> の base 幅は常に baseChars * 1em
//     に保たれ、textarea と完全に同じ位置で改行する。
// 各 reading を「単漢字 1 ルビ」の細かい segment 列に分解し、それぞれを自前の
// <span class="rb"><span class="rt">…</span>kanji</span> 構造で描画する。
// ネイティブ <ruby> は absolute な rt があっても base 幅に影響するブラウザが
// あり、累積ドリフトの原因になるため使わない。
//
// 長体ルール（仕様）:
//   ratio = max(0.5, baseWidth / rtNaturalWidth)
//   rt 自然幅が base 幅を超える場合のみ scaleX 圧縮、最大 50% まで。
const RT_FONT_RATIO = 0.4;
const MAX_CONDENSE = 0.5;

function rtTransform(baseChars: number, rtChars: number): string {
  const baseWidthEm = Math.max(1, baseChars);
  const contentWidthEm = rtChars * RT_FONT_RATIO;
  if (contentWidthEm <= baseWidthEm) return "translateX(-50%)";
  const ratio = Math.max(MAX_CONDENSE, baseWidthEm / contentWidthEm);
  return `translateX(-50%) scaleX(${ratio})`;
}

function renderRuby(text: string, readings: RubyReading[]) {
  if (readings.length === 0) return <span>{text}</span>;
  type Atom = { start: number; end: number; ruby: string };
  const atoms: Atom[] = [];
  for (const r of readings) {
    if (r.segments && r.segments.length > 0) {
      for (const s of r.segments) atoms.push({ start: s.start, end: s.end, ruby: s.ruby });
    } else {
      atoms.push({ start: r.start, end: r.end, ruby: r.kana });
    }
  }
  atoms.sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (let k = 0; k < atoms.length; k++) {
    const a = atoms[k];
    if (a.start < i) continue;
    if (a.start > i) parts.push(<span key={`tx${k}`}>{text.slice(i, a.start)}</span>);
    const baseSlice = text.slice(a.start, a.end);
    const baseChars = baseSlice.length;
    const transform = rtTransform(baseChars, a.ruby.length);
    parts.push(
      <span key={`r${k}`} className="rb">
        <span className="rt" style={{ transform, transformOrigin: "center" }}>{a.ruby}</span>
        {baseSlice}
      </span>
    );
    i = a.end;
  }
  if (i < text.length) parts.push(<span key="rtail">{text.slice(i)}</span>);
  parts.push(<span key="rsentinel">{"\n "}</span>);
  return <>{parts}</>;
}

function renderHighlighted(text: string, hls: Highlight[]) {
  if (hls.length === 0) return <span>{text}</span>;
  const sorted = [...hls].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (let k = 0; k < sorted.length; k++) {
    const h = sorted[k];
    if (h.start < i) continue;
    if (h.start > i) parts.push(<span key={`t${k}`}>{text.slice(i, h.start)}</span>);
    parts.push(
      <mark key={`h${k}`} className={`hl hl-${h.kind}`} data-msg={h.message} data-suggest={h.suggestion ?? ""}>
        {text.slice(h.start, h.end)}
      </mark>
    );
    i = h.end;
  }
  if (i < text.length) parts.push(<span key="tail">{text.slice(i)}</span>);
  parts.push(<span key="sentinel">{"\n "}</span>);
  return <>{parts}</>;
}
