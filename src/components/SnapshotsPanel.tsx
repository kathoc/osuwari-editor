import { useEffect, useState } from "react";

interface SnapshotSummary {
  id: string;
  documentId: string;
  title: string;
  label: string | null;
  createdAt: number;
  chars: number;
}

interface Props {
  docId: string;
  onRestore: (content: string) => void;
}

export function SnapshotsPanel({ docId, onRestore }: Props) {
  const [items, setItems] = useState<SnapshotSummary[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const r = await fetch(`/api/docs/${encodeURIComponent(docId)}/snapshots`);
      if (!r.ok) return setItems([]);
      setItems((await r.json()) as SnapshotSummary[]);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => { reload(); }, [docId]);

  async function takeSnapshot() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/docs/${encodeURIComponent(docId)}/snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      setLabel("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function restore(sid: string) {
    if (!confirm("この版で本文を上書きしますか？（現在の本文は自動で保存版になります）")) return;
    try {
      // 現状を退避（自動 snapshot）
      await fetch(`/api/docs/${encodeURIComponent(docId)}/snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "復元前の自動保存" }),
      });
      const r = await fetch(`/api/snapshots/${encodeURIComponent(sid)}`);
      if (!r.ok) return;
      const snap = await r.json();
      onRestore(snap.content);
      await reload();
    } catch {}
  }

  async function remove(sid: string) {
    if (!confirm("この版を削除しますか？")) return;
    try {
      await fetch(`/api/snapshots/${encodeURIComponent(sid)}`, { method: "DELETE" });
      await reload();
    } catch {}
  }

  return (
    <div className="snaps">
      <div className="snaps-head">
        履歴
        <span className="snaps-hint">手動で保存版を作成します</span>
      </div>
      <div className="snaps-create">
        <input
          value={label}
          placeholder="ラベル（例：初稿）"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !(e.nativeEvent as any).isComposing) takeSnapshot();
          }}
        />
        <button onClick={takeSnapshot} disabled={busy}>保存版を作成</button>
      </div>
      <div className="snaps-list">
        {items.length === 0 && <div className="snaps-empty">まだ保存版はありません。</div>}
        {items.map((s) => (
          <div key={s.id} className="snaps-item">
            <div className="snaps-label">{s.label || "（無題）"}</div>
            <div className="snaps-meta">
              {new Date(s.createdAt).toLocaleString()} · {s.chars}字
            </div>
            <div className="snaps-actions">
              <button onClick={() => restore(s.id)}>復元</button>
              <button onClick={() => remove(s.id)}>削除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
