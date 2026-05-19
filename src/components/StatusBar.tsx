import type { Profile } from "../lib/types";

interface Props {
  paragraphChars: number;
  totalChars: number;
  savedAt: number | null;
  highlightsCount: number;
  profile: Profile;
  onChange: (p: Profile) => void;
  rubyStatus?: {
    status: "idle" | "processing" | "ready" | "error";
    error: string | null;
    progress: { done: number; total: number };
    readingsCount: number;
  };
}

export function StatusBar({
  paragraphChars,
  totalChars,
  savedAt,
  highlightsCount,
  profile,
  onChange,
  rubyStatus,
}: Props) {
  const t = savedAt ? new Date(savedAt) : null;
  const saved = t
    ? `保存 ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
    : "未保存";
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });

  return (
    <div className="status">
      <span>段落 {paragraphChars} 字</span>
      <span>全体 {totalChars} 字</span>
      <span>指摘 {highlightsCount}</span>
      {rubyStatus && rubyStatus.status !== "idle" && (
        <span className={"status-ruby status-ruby-" + rubyStatus.status}>
          {rubyStatus.status === "processing" && (
            <>
              <span className="ruby-spinner" />
              ルビ {rubyStatus.progress.done}/{rubyStatus.progress.total} 語
            </>
          )}
          {rubyStatus.status === "ready" && (
            <>ルビ {rubyStatus.readingsCount}件 ({rubyStatus.progress.total}語)</>
          )}
          {rubyStatus.status === "error" && (
            <span className="ruby-status-error">ルビ失敗: {rubyStatus.error || "?"}</span>
          )}
        </span>
      )}
      <label className="status-size">
        <span className="status-size-label">サイズ</span>
        <input
          type="range"
          min={12}
          max={28}
          value={profile.fontSize}
          onChange={(e) => set({ fontSize: Number(e.target.value) })}
        />
        <span className="val">{profile.fontSize}px</span>
        {profile.longUsedFontSize != null && profile.longUsedFontSize !== profile.fontSize && (
          <button
            type="button"
            className="zoom-restore"
            title={`元のサイズ ${profile.longUsedFontSize}px に戻す`}
            onClick={() => set({ fontSize: profile.longUsedFontSize! })}
          >
            ↩{profile.longUsedFontSize}
          </button>
        )}
      </label>
      <span className="saved">{saved}</span>
    </div>
  );
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
