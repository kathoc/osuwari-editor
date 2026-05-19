import { useEffect, useMemo, useState } from "react";
import type { AIAdapter } from "../lib/ai/types";
import type { RubyReading, RubyReviewItem } from "../lib/analyze";

interface Selection {
  start: number;
  end: number;
  text: string;
}

interface Props {
  adapter: AIAdapter;
  selection: Selection | null;
  content: string;
  autoReadings: RubyReading[];
  manualReadings: RubyReading[];
  reviewQueue?: RubyReviewItem[];
  furiganaStatus?: "idle" | "processing" | "ready" | "error";
  onSetManual: (range: { start: number; end: number }, kana: string) => void;
  onRemoveManual: (range: { start: number; end: number }) => void;
  onRefreshAuto?: () => void;
}

const SOURCE_LABEL: Record<NonNullable<RubyReading["source"]>, string> = {
  manual: "手動",
  user_dictionary: "user辞書",
  dictionary: "辞書",
  context_rule: "文脈",
  rule: "規則",
  ai: "AI",
  unknown: "不明",
};

const MODE_LABEL: Record<NonNullable<RubyReading["rubyMode"]>, string> = {
  mono: "モノルビ",
  group: "グループ",
  jukugo: "熟語",
  unknown: "不明",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const cls = value >= 0.85 ? "high" : value >= 0.75 ? "mid" : "low";
  return (
    <span className={`rubypanel-confidence rubypanel-confidence-${cls}`} title={`信頼度 ${pct}%`}>
      <span className="rubypanel-confidence-bar">
        <span className="rubypanel-confidence-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="rubypanel-confidence-num">{pct}%</span>
    </span>
  );
}

export function RubyPanel({
  adapter,
  selection,
  content,
  autoReadings,
  manualReadings,
  reviewQueue,
  furiganaStatus,
  onSetManual,
  onRemoveManual,
  onRefreshAuto,
}: Props) {
  const [kanaInput, setKanaInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setKanaInput("");
    setAiError(null);
  }, [selection?.start, selection?.end]);

  const overlap = useMemo(() => {
    if (!selection) return { manual: [] as RubyReading[], auto: [] as RubyReading[], review: [] as RubyReviewItem[] };
    const within = (r: { start: number; end: number }) =>
      r.start < selection.end && r.end > selection.start;
    return {
      manual: manualReadings.filter(within),
      auto: autoReadings.filter(within),
      review: (reviewQueue ?? []).filter(within),
    };
  }, [selection, manualReadings, autoReadings, reviewQueue]);

  const hasManualInRange = overlap.manual.length > 0;

  const visibleReviewQueue = useMemo(() => {
    if (!reviewQueue) return [] as RubyReviewItem[];
    if (selection && overlap.review.length > 0) return overlap.review;
    return reviewQueue.slice(0, 8);
  }, [reviewQueue, selection, overlap.review]);

  async function askAi() {
    if (!selection) return;
    if (!adapter.generateRuby) {
      setAiError("選択中の AI アダプタはルビ生成に対応していません（設定で Ollama を選択してください）");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const entries = await adapter.generateRuby({ sentence: selection.text });
      if (entries.length === 0) {
        setAiError("AI から有効な読みが返りませんでした");
        return;
      }
      const kana = entries.map((e) => e.kana).join("");
      if (kana) setKanaInput(kana);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  function applyManual() {
    if (!selection || !kanaInput.trim()) return;
    onSetManual({ start: selection.start, end: selection.end }, kanaInput.trim());
  }

  function applyFromReview(item: RubyReviewItem, candidate: string) {
    onSetManual({ start: item.start, end: item.end }, candidate);
  }

  function removeManual() {
    if (!selection) return;
    onRemoveManual({ start: selection.start, end: selection.end });
  }

  return (
    <div className="rubypanel">
      <div className="rubypanel-head">
        ルビ
        <span className="rubypanel-status">
          {selection ? `選択 ${selection.text.length}字` : "本文を選択してください"}
        </span>
        {onRefreshAuto && (
          <button
            className="rubypanel-refresh"
            onClick={onRefreshAuto}
            disabled={furiganaStatus === "processing"}
            title="キャッシュを破棄して全文のルビを再解析"
          >
            {furiganaStatus === "processing" ? "解析中…" : "↻ 一括で振り直す"}
          </button>
        )}
      </div>

      {!selection && (
        <div className="rubypanel-empty">
          本文中の語を選択すると、現在のルビ状態の確認と手動ルビの付与/解除ができます。
        </div>
      )}

      {selection && (
        <>
          <div className="rubypanel-section">
            <div className="rubypanel-section-title">選択中</div>
            <div className="rubypanel-selected">{selection.text}</div>
          </div>

          <div className="rubypanel-section">
            <div className="rubypanel-section-title">
              現在のルビ
              {overlap.manual.length + overlap.auto.length === 0 && (
                <span className="rubypanel-quiet">（なし）</span>
              )}
            </div>
            {(overlap.manual.length > 0 || overlap.auto.length > 0) && (
              <ul className="rubypanel-readings">
                {overlap.manual.map((r, i) => (
                  <li key={"m" + i}>
                    <div className="rubypanel-row-main">
                      <span className="rubypanel-base">{content.slice(r.start, r.end)}</span>
                      <span className="rubypanel-arrow">→</span>
                      <span className="rubypanel-kana">{r.kana}</span>
                      <span className="rubypanel-tag rubypanel-tag-manual">手動</span>
                    </div>
                  </li>
                ))}
                {overlap.auto.map((r, i) => (
                  <li key={"a" + i}>
                    <div className="rubypanel-row-main">
                      <span className="rubypanel-base">{content.slice(r.start, r.end)}</span>
                      <span className="rubypanel-arrow">→</span>
                      <span className="rubypanel-kana">{r.kana}</span>
                      {r.source && (
                        <span className={`rubypanel-tag rubypanel-tag-${r.source}`}>
                          {SOURCE_LABEL[r.source]}
                        </span>
                      )}
                      {r.rubyMode && r.rubyMode !== "unknown" && (
                        <span className="rubypanel-tag rubypanel-tag-mode">{MODE_LABEL[r.rubyMode]}</span>
                      )}
                      {typeof r.confidence === "number" && <ConfidenceBar value={r.confidence} />}
                    </div>
                    {(r.reason || (r.flags && r.flags.length > 0)) && (
                      <div className="rubypanel-row-meta">
                        {r.flags?.map((f) => (
                          <span key={f} className={`rubypanel-flag rubypanel-flag-${f}`}>
                            {f}
                          </span>
                        ))}
                        {r.reason && <span className="rubypanel-reason">{r.reason}</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rubypanel-section">
            <div className="rubypanel-section-title">手動でルビを設定</div>
            <div className="rubypanel-input-row">
              <input
                value={kanaInput}
                placeholder="読み（ひらがな）"
                onChange={(e) => setKanaInput(e.target.value)}
              />
              <button onClick={askAi} disabled={aiBusy} title="AIに読みを尋ねる">
                {aiBusy ? "…" : "AIに尋ねる"}
              </button>
            </div>
            <div className="rubypanel-buttons">
              <button
                className="rubypanel-primary"
                onClick={applyManual}
                disabled={!kanaInput.trim()}
              >
                ルビを設定（「{selection.text}」→ {kanaInput || "?"}）
              </button>
              <button
                className="rubypanel-danger"
                onClick={removeManual}
                disabled={!hasManualInRange}
                title={hasManualInRange ? "範囲内の手動ルビ記法を削除" : "範囲内に手動ルビはありません"}
              >
                解除
              </button>
            </div>
            {aiError && <div className="rubypanel-error">{aiError}</div>}
            <div className="rubypanel-hint">
              本文には ｜選択語《よみ》 の形式で挿入されます。
            </div>
          </div>
        </>
      )}

      {visibleReviewQueue.length > 0 && (
        <div className="rubypanel-section">
          <div className="rubypanel-section-title">
            要確認 <span className="rubypanel-quiet">（低信頼 / 多読語）</span>
          </div>
          <ul className="rubypanel-review">
            {visibleReviewQueue.map((item, i) => (
              <li key={i}>
                <div className="rubypanel-row-main">
                  <span className="rubypanel-base">{item.base}</span>
                  <span className="rubypanel-quiet">{item.reason}</span>
                </div>
                <div className="rubypanel-review-context">{item.context}</div>
                {item.candidates.length > 0 && (
                  <div className="rubypanel-review-candidates">
                    {item.candidates.map((c) => (
                      <button
                        key={c}
                        className="rubypanel-candidate"
                        onClick={() => applyFromReview(item, c)}
                        title={`この箇所に「${c}」を手動ルビとして適用`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
