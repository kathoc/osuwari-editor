import { applyMemoToDoc } from "../applyMemo";
import type { AIAdapter } from "./types";

export const mockAdapter: AIAdapter = {
  id: "mock",
  name: "Mock (ローカルルール)",
  async isAvailable() {
    return true;
  },
  async generateFromMemo({ memo, content, docId }) {
    await new Promise((r) => setTimeout(r, 120));
    return applyMemoToDoc(memo, content, docId);
  },
  async rewrite({ text, instruction, constraint }) {
    await new Promise((r) => setTimeout(r, 180));
    let out = text;
    if (/敬体|です\/ます|です・ます|ですます/.test(instruction)) {
      out = out.replace(/だ。/g, "です。").replace(/である。/g, "です。");
    } else if (/常体|だ\/である|だ・である/.test(instruction)) {
      out = out.replace(/です。/g, "だ。").replace(/ます。/g, "る。");
    }
    if (/短く|簡潔|圧縮|削って|削る/.test(instruction)) {
      const target = Math.max(20, Math.floor(text.length * 0.7));
      out = out.replace(/、/g, "").slice(0, target);
    }
    if (/やわらか/.test(instruction)) {
      out = out.replace(/。/g, "ね。");
    }
    const maxChars =
      constraint?.maxChars ??
      (constraint?.widthChars && constraint?.maxLines ? constraint.widthChars * constraint.maxLines : null);
    if (maxChars && out.length > maxChars) out = out.slice(0, maxChars);
    return out + "（mock）";
  },

  async chat({ instruction, context }) {
    await new Promise((r) => setTimeout(r, 250));
    const head = context.slice(0, 60).replace(/\s+/g, " ");
    return [
      `（モック応答 / ${new Date().toLocaleTimeString()}）`,
      `指示: ${instruction}`,
      `本文の冒頭: ${head}${context.length > 60 ? "…" : ""}`,
      "──",
      "本文には自動反映されません。プレビュー→実行で適用します。",
    ].join("\n");
  },
};
