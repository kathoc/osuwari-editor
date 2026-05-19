import { useEffect, useMemo, useRef, useState } from "react";
import type { AIAdapter } from "../lib/ai/types";
import { summarizeInstruction } from "../lib/pending";
import type { AISendKey, PendingProposal } from "../lib/types";

interface Selection {
  start: number;
  end: number;
  text: string;
}

interface RecentEntry {
  label: string;
  instruction: string;
  count: number;
  lastUsed: number;
}

interface Props {
  adapter: AIAdapter;
  selection: Selection | null;
  pending: PendingProposal[];
  sendKey: AISendKey;
  onRun: (instruction: string, sel: Selection) => Promise<void>;
  onGenerate?: (instruction: string) => Promise<void>;
  onDiscard: (id: string) => void;
  onCommitAll: () => void;
  prefill?: { text: string; token: number } | null;
  onPrefillConsumed?: () => void;
}

const DEFAULT_PRESETS: { label: string; instruction: string }[] = [
  { label: "やわらかく", instruction: "やわらかく親しみのある語感に書き換える" },
  { label: "短く", instruction: "意味を保ったまま簡潔に短くする" },
  { label: "敬体に統一", instruction: "敬体（です・ます調）に統一する" },
  { label: "常体に統一", instruction: "常体（だ・である調）に統一する" },
  { label: "冗長カット", instruction: "冗長な表現や重複を削り、リズムよくする" },
  { label: "見出し化", instruction: "短い見出しに書き換える（10〜20字程度）" },
];

const GENERATE_PRESETS: { label: string; instruction: string }[] = [
  { label: "1500字の小説を生成", instruction: "1500字程度の短編小説を1本書いてください。テーマや舞台は自由に設定してください。" },
  { label: "原稿の事実確認", instruction: "現在の原稿全体について、事実関係が怪しい箇所や裏取りすべき点を箇条書きで列挙してください。" },
  { label: "200字の導入を書く", instruction: "原稿の導入として読者を引き込む200字程度の文章を書いてください。" },
  { label: "あらすじ要約", instruction: "現在の原稿の内容を300字程度で要約してください。" },
];

const RECENTS_KEY = "osuwari.aiRecentPresets.v1";
const RECENTS_MAX = 8;

function loadRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return DEFAULT_PRESETS.map((p) => ({ ...p, count: 0, lastUsed: 0 }));
    const arr = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(arr)) throw new Error("bad");
    return arr;
  } catch {
    return DEFAULT_PRESETS.map((p) => ({ ...p, count: 0, lastUsed: 0 }));
  }
}
function saveRecents(xs: RecentEntry[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(xs));
  } catch {}
}

export function RewritePanel({ adapter, selection, pending, sendKey, onRun, onGenerate, onDiscard, onCommitAll, prefill, onPrefillConsumed }: Props) {
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const [recents, setRecents] = useState<RecentEntry[]>(() => loadRecents());

  // 外部（メモタブ等）からプリフィル
  const lastPrefillToken = useRef<number>(0);
  useEffect(() => {
    if (!prefill) return;
    if (prefill.token === lastPrefillToken.current) return;
    lastPrefillToken.current = prefill.token;
    setCustom(prefill.text);
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);
  // IME 確定直後の Enter を弾くためのフラグ
  const composingRef = useRef(false);
  const justComposedAtRef = useRef(0);

  useEffect(() => saveRecents(recents), [recents]);

  const sortedPresets = useMemo(
    () =>
      [...recents]
        .sort((a, b) => (b.lastUsed - a.lastUsed) || (b.count - a.count))
        .slice(0, RECENTS_MAX),
    [recents]
  );

  function upsertRecent(label: string, instruction: string) {
    setRecents((xs) => {
      const now = Date.now();
      const idx = xs.findIndex((x) => x.instruction === instruction);
      let next: RecentEntry[];
      if (idx >= 0) {
        next = xs.map((x, i) => (i === idx ? { ...x, count: x.count + 1, lastUsed: now, label } : x));
      } else {
        next = [{ label, instruction, count: 1, lastUsed: now }, ...xs];
      }
      // 上限: lastUsed が古い順に切り捨て（合計>RECENTS_MAX のときのみ）
      if (next.length > RECENTS_MAX) {
        next = [...next].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, RECENTS_MAX);
      }
      return next;
    });
  }

  async function run(instruction: string, isCustom: boolean) {
    if (busy) return;
    const inst = instruction.trim();
    if (!inst) return;
    setBusy(true);
    try {
      if (selection) {
        const sel = selection;
        await onRun(inst, sel);
      } else if (onGenerate) {
        await onGenerate(inst);
      } else {
        return;
      }
      if (isCustom) {
        const label = await summarizeInstruction(adapter, inst);
        upsertRecent(label, inst);
      } else {
        const existing = recents.find((r) => r.instruction === inst);
        if (existing) upsertRecent(existing.label, inst);
      }
    } finally {
      setBusy(false);
    }
  }

  const hasPending = pending.length > 0;
  const generateMode = !selection;
  const presetsToShow = generateMode ? GENERATE_PRESETS : sortedPresets;

  return (
    <div className="rewrite">
      <div className="rewrite-head">
        AI
        <span className="rewrite-status">
          {selection
            ? `選択 ${selection.text.length}字を書き換え`
            : hasPending
            ? `候補 ${pending.length}件`
            : "生成モード（選択範囲なし）"}
        </span>
      </div>
      <div className="rewrite-actions">
        <div className="rewrite-presets">
          {presetsToShow.map((p) => (
            <button
              key={p.instruction}
              disabled={busy}
              onClick={() => run(p.instruction, false)}
              title={p.instruction}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="rewrite-custom">
          <input
            value={custom}
            placeholder={
              generateMode
                ? sendKey === "ctrl-enter"
                  ? "指示を入力（⌘/Ctrl+Enter で送信）例: 1500字の小説を生成して"
                  : "指示を入力（Enter で送信）例: 1500字の小説を生成して"
                : sendKey === "ctrl-enter"
                ? "任意の指示（⌘/Ctrl+Enter で送信）"
                : "任意の指示（Enter で送信）"
            }
            onChange={(e) => setCustom(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              justComposedAtRef.current = Date.now();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // IME 変換中、または変換確定の Enter を弾く
              if (composingRef.current) return;
              if ((e.nativeEvent as KeyboardEvent).isComposing) return;
              if (e.keyCode === 229) return;
              if (Date.now() - justComposedAtRef.current < 200) return;
              const hasMod = e.ctrlKey || e.metaKey;
              if (sendKey === "ctrl-enter") {
                if (!hasMod) return;
              } else {
                // 通常モード: 修飾なしの Enter のみ送信
                if (hasMod) return;
              }
              if (!custom.trim()) return;
              e.preventDefault();
              const v = custom;
              setCustom("");
              run(v, true);
            }}
            disabled={busy}
          />
          <button
            disabled={busy || !custom.trim()}
            onClick={() => {
              const v = custom;
              setCustom("");
              run(v, true);
            }}
          >
            実行
          </button>
        </div>
      </div>
      {hasPending && (
        <div className="rewrite-commit-row">
          <button className="rewrite-commit-all" onClick={onCommitAll}>
            すべて確定（{pending.length}）
          </button>
          <span className="rewrite-commit-hint">
            ピンクの下線部が候補。エディタで手書き編集すると、確定時はその手書きが優先されます。
          </span>
        </div>
      )}
      <div className="rewrite-list">
        {!hasPending && !busy && (
          <div className="rewrite-empty">候補はここに並びます。</div>
        )}
        {busy && pending.length === 0 && (
          <div className="rewrite-thinking-row">
            <span className="thinking-label">考え中</span>
            <span className="thinking-dots">
              <i></i>
              <i></i>
              <i></i>
            </span>
          </div>
        )}
        {pending.map((p) => (
          <div key={p.id} className={"rewrite-item s-pending" + (p.manuallyEdited ? " manual" : "")}>
            <div className="rewrite-inst">▶ {p.instruction}</div>
            <div className="rewrite-diff">
              <div className="rewrite-before" title="元の文">{p.before}</div>
              <div className="rewrite-arrow">↓</div>
              <div className="rewrite-after" title="書き換え候補（仮反映中）">{p.after}</div>
            </div>
            <div className="rewrite-actions-row">
              {p.manuallyEdited && <span className="badge manual">手書き優先</span>}
              <button className="rewrite-discard" onClick={() => onDiscard(p.id)}>破棄</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
