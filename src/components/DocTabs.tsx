import type { DocumentSummary } from "../lib/types";

interface Props {
  docs: DocumentSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function DocTabs({ docs, activeId, onSelect, onDelete, onRename }: Props) {
  return (
    <div className="doctabs">
      <div className="doctabs-list">
        {docs.map((d) => (
          <div
            key={d.id}
            className={"doctab " + (d.id === activeId ? "active" : "")}
            onClick={() => onSelect(d.id)}
            onDoubleClick={() => {
              const next = prompt("タイトルを変更", d.title);
              if (next && next.trim() && next !== d.title) onRename(d.id, next.trim());
            }}
            title={d.sourcePath ? `元: ${d.sourcePath}` : `${d.chars} 字`}
          >
            <span className="doctab-title">{d.title || "無題"}</span>
            <span className="doctab-chars">{d.chars}</span>
            {d.id !== "default" && (
              <button
                className="doctab-x"
                title="削除"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`「${d.title}」を削除しますか？`)) onDelete(d.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
