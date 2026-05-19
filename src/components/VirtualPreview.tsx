import { useMemo } from "react";
import { wrapByWidth, visualWidth } from "../lib/width";
import type { VirtualLayout } from "../lib/types";
import { currentParagraph } from "../lib/analyze";

interface Props {
  text: string;
  cursor: number;
  layout: VirtualLayout;
}

export function VirtualPreview({ text, cursor, layout }: Props) {
  const para = useMemo(() => currentParagraph(text, cursor), [text, cursor]);
  const lines = useMemo(() => wrapByWidth(para.text, layout.widthChars), [para.text, layout.widthChars]);
  const over = lines.length > layout.maxLines;
  return (
    <div className="vpreview">
      <div className="vpreview-head">
        仮想行幅 {layout.widthChars}W × {layout.maxLines}L
        <span className={"vpreview-state " + (over ? "over" : "ok")}>
          {lines.length} / {layout.maxLines} 行
          {over ? "（超過）" : ""}
        </span>
      </div>
      <div className="vpreview-body">
        {lines.slice(0, Math.max(layout.maxLines, lines.length)).map((ln, i) => (
          <div
            key={i}
            className={"vpreview-line " + (i >= layout.maxLines ? "overflow" : "")}
            style={{ width: `${layout.widthChars}ch` }}
          >
            <span className="vpreview-num">{i + 1}</span>
            <span className="vpreview-text">{ln || "　"}</span>
            <span className="vpreview-w">{visualWidth(ln).toFixed(1)}</span>
          </div>
        ))}
        {lines.length === 0 && <div className="vpreview-empty">（段落が空）</div>}
      </div>
    </div>
  );
}
