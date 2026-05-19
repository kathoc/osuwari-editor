import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchOptions {
  query: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  mode: "find" | "replace";
}

interface Props {
  open: boolean;
  initial: SearchOptions;
  content: string;
  onClose: () => void;
  onMatchesChange: (matches: Match[], current: number) => void;
  onJump: (match: Match) => void;
  onReplaceOne: (match: Match, replacement: string) => void;
  onReplaceAll: (matches: Match[], computeReplacement: (m: Match) => string) => void;
}

export interface Match {
  start: number;
  end: number;
  groups?: string[];
}

function compileMatches(content: string, opt: SearchOptions): { matches: Match[]; error: string | null } {
  if (!opt.query) return { matches: [], error: null };
  try {
    if (opt.useRegex) {
      const flags = "g" + (opt.caseSensitive ? "" : "i");
      const re = new RegExp(opt.query, flags);
      const out: Match[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        out.push({ start: m.index, end: m.index + m[0].length, groups: m.slice(1) });
        if (m[0].length === 0) re.lastIndex++;
      }
      return { matches: out, error: null };
    } else {
      const out: Match[] = [];
      const needle = opt.caseSensitive ? opt.query : opt.query.toLowerCase();
      const hay = opt.caseSensitive ? content : content.toLowerCase();
      let i = 0;
      while (i <= hay.length - needle.length) {
        const idx = hay.indexOf(needle, i);
        if (idx === -1) break;
        out.push({ start: idx, end: idx + needle.length });
        i = idx + Math.max(1, needle.length);
      }
      return { matches: out, error: null };
    }
  } catch (e) {
    return { matches: [], error: e instanceof Error ? e.message : String(e) };
  }
}

function applyReplaceTemplate(template: string, m: Match): string {
  // 正規表現キャプチャの $1, $2 ... を展開（非正規表現の場合は groups 無いので素通り）
  return template.replace(/\$(\d+|&)/g, (_, k) => {
    if (k === "&") return ""; // 簡略実装: 元一致は別経路で扱う
    const n = Number(k);
    if (!m.groups) return "";
    return m.groups[n - 1] ?? "";
  });
}

export function SearchPanel({
  open,
  initial,
  content,
  onClose,
  onMatchesChange,
  onJump,
  onReplaceOne,
  onReplaceAll,
}: Props) {
  const [opt, setOpt] = useState<SearchOptions>(initial);
  const [current, setCurrent] = useState(0);
  const queryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOpt(initial);
  }, [initial.mode, initial.query]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => queryRef.current?.focus());
    }
  }, [open]);

  const { matches, error } = useMemo(() => compileMatches(content, opt), [content, opt]);

  useEffect(() => {
    onMatchesChange(matches, current);
  }, [matches, current, onMatchesChange]);

  useEffect(() => {
    if (current >= matches.length) setCurrent(0);
  }, [matches.length, current]);

  function next() {
    if (matches.length === 0) return;
    const n = (current + 1) % matches.length;
    setCurrent(n);
    onJump(matches[n]);
  }
  function prev() {
    if (matches.length === 0) return;
    const n = (current - 1 + matches.length) % matches.length;
    setCurrent(n);
    onJump(matches[n]);
  }
  function replaceOne() {
    if (matches.length === 0) return;
    const m = matches[current];
    const repl = opt.useRegex ? applyReplaceTemplate(opt.replace, m) : opt.replace;
    onReplaceOne(m, repl);
  }
  function replaceAll() {
    if (matches.length === 0) return;
    onReplaceAll(matches, (m) => (opt.useRegex ? applyReplaceTemplate(opt.replace, m) : opt.replace));
  }

  if (!open) return null;

  return (
    <div className="searchpanel" role="search">
      <div className="searchpanel-row">
        <input
          ref={queryRef}
          className="searchpanel-input"
          value={opt.query}
          placeholder={opt.useRegex ? "正規表現を入力" : "検索文字列"}
          onChange={(e) => setOpt({ ...opt, query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <span className="searchpanel-count">
          {error ? <span className="searchpanel-error">{error}</span> : matches.length === 0 ? "0 件" : `${current + 1}/${matches.length}`}
        </span>
        <button onClick={prev} title="前へ (Shift+Enter)" disabled={matches.length === 0}>↑</button>
        <button onClick={next} title="次へ (Enter)" disabled={matches.length === 0}>↓</button>
        <label className="searchpanel-toggle" title="正規表現">
          <input
            type="checkbox"
            checked={opt.useRegex}
            onChange={(e) => setOpt({ ...opt, useRegex: e.target.checked })}
          />
          .*
        </label>
        <label className="searchpanel-toggle" title="大文字小文字を区別">
          <input
            type="checkbox"
            checked={opt.caseSensitive}
            onChange={(e) => setOpt({ ...opt, caseSensitive: e.target.checked })}
          />
          Aa
        </label>
        <button className="searchpanel-mode" onClick={() => setOpt({ ...opt, mode: opt.mode === "find" ? "replace" : "find" })} title="置換モード切替">
          {opt.mode === "find" ? "置換▾" : "閉じる▴"}
        </button>
        <button onClick={onClose} className="searchpanel-close" aria-label="閉じる">×</button>
      </div>
      {opt.mode === "replace" && (
        <div className="searchpanel-row">
          <input
            className="searchpanel-input"
            value={opt.replace}
            placeholder={opt.useRegex ? "置換文字列（$1 …）" : "置換文字列"}
            onChange={(e) => setOpt({ ...opt, replace: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) replaceAll();
                else replaceOne();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <button onClick={replaceOne} disabled={matches.length === 0}>置換</button>
          <button onClick={replaceAll} disabled={matches.length === 0}>すべて置換</button>
        </div>
      )}
    </div>
  );
}
