import { useEffect, useState } from "react";
import { getLocalLlmBridge, type LocalLlmProgress } from "../lib/ai/localLlm";

interface Props {
  expectedSizeBytes: number;
  onClose: (action: "downloaded" | "later" | "never") => void;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(0) + " MB";
  return Math.round(n / 1024) + " KB";
}

export function LocalLlmIntroDialog({ expectedSizeBytes, onClose }: Props) {
  const [progress, setProgress] = useState<LocalLlmProgress | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const bridge = getLocalLlmBridge();
    if (!bridge) return;
    const off = bridge.onProgress((p) => {
      setProgress(p);
      if (p.status === "done") {
        setDownloading(false);
        onClose("downloaded");
      } else if (p.status === "error" || p.status === "cancelled") {
        setDownloading(false);
      }
    });
    return off;
  }, [onClose]);

  async function startDl() {
    const bridge = getLocalLlmBridge();
    if (!bridge) return;
    setDownloading(true);
    setProgress({ status: "downloading", received: 0, total: expectedSizeBytes });
    const r = await bridge.startDownload();
    if (!r.ok) {
      setDownloading(false);
      setProgress({ status: "error", received: 0, total: expectedSizeBytes, error: r.reason || "unknown" });
    }
  }

  async function cancelDl() {
    const bridge = getLocalLlmBridge();
    if (!bridge) return;
    await bridge.cancelDownload();
    setDownloading(false);
  }

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.floor((progress.received / progress.total) * 100))
      : 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="local-llm-intro-title">
      <div className="modal-card">
        <h2 id="local-llm-intro-title" className="modal-title">ローカルAI(オンデバイス)を導入しますか?</h2>
        <p className="modal-body">
          本アプリは、外部サーバーに本文を送らずに動く<strong>ローカルAI</strong>を内蔵できます。
          有効にすると、メモからの本文生成や言い換えなどがオフラインでも使えるようになります。
        </p>
        <ul className="modal-cautions">
          <li>
            <strong>容量に注意</strong>: モデルファイルは <b>{formatBytes(expectedSizeBytes)}</b> ほどあります。
            Wi-Fi や十分なディスク空きのある環境でのダウンロードを推奨します。
          </li>
          <li>ダウンロード中はネットワークを占有することがあります。</li>
          <li>導入しなくても、後から「原稿」タブの設定画面でいつでも導入できます。</li>
        </ul>

        {progress && (
          <div className="local-llm-progress">
            <div className="local-llm-progress-bar">
              <div className="local-llm-progress-fill" style={{ width: pct + "%" }} />
            </div>
            <div className="local-llm-progress-meta">
              {progress.status === "downloading" && (
                <>
                  {pct}% ({formatBytes(progress.received)} / {formatBytes(progress.total)})
                </>
              )}
              {progress.status === "done" && <>完了しました。</>}
              {progress.status === "cancelled" && <>中断しました。</>}
              {progress.status === "error" && <>エラー: {progress.error}</>}
            </div>
          </div>
        )}

        <div className="modal-actions">
          {downloading ? (
            <button className="modal-btn" onClick={cancelDl}>ダウンロードを中止</button>
          ) : (
            <>
              <button className="modal-btn modal-btn-secondary" onClick={() => onClose("never")} title="次回以降この案内を表示しません">
                今後表示しない
              </button>
              <button className="modal-btn modal-btn-secondary" onClick={() => onClose("later")}>
                後で
              </button>
              <button className="modal-btn modal-btn-primary" onClick={startDl}>
                ダウンロードする
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
