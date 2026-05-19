import { useState } from "react";
import type { MemoDraftProposal } from "../lib/types";

interface Props {
  drafts: MemoDraftProposal[];
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  onRetry: (id: string) => void;
}

const STATUS_LABEL: Record<MemoDraftProposal["status"], string> = {
  pending: "生成中…",
  ready: "下書きできました",
  applied: "本文に追記済み",
  rejected: "破棄",
  failed: "生成失敗",
};

export function MemoDraftPanel({ drafts, onApply, onReject, onRetry }: Props) {
  const visible = drafts.filter((d) => d.status !== "rejected");
  return (
    <div className="mdraft">
      <div className="mdraft-head">
        <span>助手草稿</span>
        <span className="mdraft-hint">
          メモを書きためるほど、若手ライターが荒い下書きを並べます。事実は要確認。
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="mdraft-empty">
          メモ欄で改行確定すると、ここに荒い下書き候補が並びます。
        </div>
      ) : (
        <div className="mdraft-list">
          {visible
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((d) => (
              <DraftCard key={d.id} draft={d} onApply={onApply} onReject={onReject} onRetry={onRetry} />
            ))}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  onApply,
  onReject,
  onRetry,
}: {
  draft: MemoDraftProposal;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isPending = draft.status === "pending";
  const isReady = draft.status === "ready";
  const isFailed = draft.status === "failed";
  const isApplied = draft.status === "applied";
  return (
    <div className={`mdraft-card s-${draft.status}`}>
      <div className="mdraft-card-head">
        <span className="mdraft-card-memo" title={draft.memo}>
          ▶ {draft.memo}
        </span>
        <span className="mdraft-card-status">{STATUS_LABEL[draft.status]}</span>
      </div>
      {isPending && (
        <div className="mdraft-thinking">
          <span className="thinking-label">考え中</span>
          <span className="thinking-dots">
            <i></i>
            <i></i>
            <i></i>
          </span>
        </div>
      )}
      {isFailed && (
        <div className="mdraft-error">{draft.errorMessage || "AIから草稿を取得できませんでした。"}</div>
      )}
      {(isReady || isApplied) && (
        <>
          <div className={`mdraft-body${collapsed ? " collapsed" : ""}`}>{draft.draftText}</div>
          {draft.draftText.length > 220 && (
            <button className="mdraft-toggle" onClick={() => setCollapsed((v) => !v)}>
              {collapsed ? "全文を見る" : "折りたたむ"}
            </button>
          )}
          {draft.cautionNotes.length > 0 && (
            <div className="mdraft-cautions">
              <div className="mdraft-cautions-head">要確認メモ</div>
              <ul>
                {draft.cautionNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <div className="mdraft-actions">
        <button
          className="mdraft-apply"
          disabled={!isReady}
          onClick={() => onApply(draft.id)}
          title="本文末尾に追記します"
        >
          採用
        </button>
        <button
          className="mdraft-reject"
          disabled={isPending}
          onClick={() => onReject(draft.id)}
        >
          破棄
        </button>
        <button
          className="mdraft-retry"
          disabled={isPending}
          onClick={() => onRetry(draft.id)}
          title="同じメモから別案をもう一度生成します"
        >
          再生成
        </button>
      </div>
    </div>
  );
}
