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

  async expandMemoDraft({ memo, mode }) {
    await new Promise((r) => setTimeout(r, 220));
    const m = mode || "normal";
    const lead =
      m === "safe"
        ? `${memo}について、まずは分かっている範囲から短く整理してみます。`
        : m === "wild"
        ? `${memo}を、思い切って物語の入口のように描いてみます。`
        : `${memo}について、若手ライターの下書きとして、ざっくり書き起こしてみます。`;
    const body =
      "全体像をなだらかに広げると、いくつかの要素が見えてきます。" +
      "まずは表面の動きをなぞり、そのあとで仕組みに踏み込みます。" +
      "細部はまだ仮置きで、データや出典は後で差し替える前提です。" +
      "読み手が一気に置いていかれないよう、ひとつずつ言い換えながらつないでいきます。";
    const tail = "（mock草稿。事実関係は要確認）";
    return {
      draftText: `${lead}${body}${tail}`,
      cautionNotes: [
        "固有名詞や数値は仮置き（mockのため要確認）",
        "メモから補えていない前提条件があるかも",
      ],
    };
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
