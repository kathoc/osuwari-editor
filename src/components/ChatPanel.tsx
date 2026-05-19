import { useState } from "react";
import type { AIAdapter } from "../lib/ai/types";
import type { AIProposal } from "../lib/types";
import { newId } from "../lib/storage";

interface Props {
  adapter: AIAdapter;
  context: string;
  onApply: (text: string) => void;
}

export function ChatPanel({ adapter, context, onApply }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<AIProposal[]>([]);

  async function send() {
    const instruction = input.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setInput("");
    try {
      const proposalText = await adapter.chat({ instruction, context });
      const p: AIProposal = {
        id: newId(),
        instruction,
        proposalText,
        status: "preview",
        createdAt: Date.now(),
      };
      setItems((xs) => [p, ...xs]);
    } finally {
      setBusy(false);
    }
  }

  function setStatus(id: string, status: AIProposal["status"]) {
    setItems((xs) => xs.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  return (
    <div className="chat">
      <div className="chat-head">
        チャット <span className="chat-adapter">adapter: {adapter.name}</span>
      </div>
      <div className="chat-list">
        {items.length === 0 && <div className="chat-empty">下の入力欄から指示できます。本文には自動反映されません。</div>}
        {items.map((p) => (
          <div key={p.id} className={"chat-item s-" + p.status}>
            <div className="chat-inst">▶ {p.instruction}</div>
            <pre className="chat-prop">{p.proposalText}</pre>
            <div className="chat-actions">
              {p.status === "preview" && (
                <>
                  <button
                    onClick={() => {
                      onApply(p.proposalText);
                      setStatus(p.id, "applied");
                    }}
                  >
                    実行
                  </button>
                  <button onClick={() => setStatus(p.id, "rejected")}>破棄</button>
                </>
              )}
              {p.status === "applied" && <span className="badge applied">適用済み</span>}
              {p.status === "rejected" && <span className="badge rejected">破棄</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          rows={2}
          placeholder="例：この段落をやわらかい語感に / 見出し案を3つ"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          {busy ? "…" : "送信"}
        </button>
      </div>
      <div className="chat-hint">⌘/Ctrl + Enter で送信</div>
    </div>
  );
}
