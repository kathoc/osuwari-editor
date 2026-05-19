import type { AIAdapter, MemoDraftRequest, MemoDraftResult } from "./types";

const MODE_HINT: Record<NonNullable<MemoDraftRequest["mode"]>, string> = {
  safe: "推測は最小限に抑え、メモに含まれる範囲だけを丁寧に膨らませてください。300〜400字目安。",
  normal: "メモから自然に連想できる説明や具体例を補い、読み物としてのリズムを保ってください。400〜500字目安。",
  wild: "メモを起点に思い切って踏み込み、想像や例示を交えて読み応えのある下書きに仕立ててください。推測が増えやすいので cautionNotes は丁寧に。500〜600字目安。",
};

export function buildMemoDraftPrompt(req: MemoDraftRequest): string {
  const mode = req.mode || "normal";
  const tail = (req.content || "").slice(-1200);
  const recent = (req.recentMemos || []).filter((m) => m && m !== req.memo).slice(-5);
  const recentBlock = recent.length ? `\n# 直近のメモ\n${recent.map((m) => `- ${m}`).join("\n")}\n` : "";
  const ctxBlock = tail ? `\n# 既存本文（末尾抜粋）\n${tail}\n` : "";
  const toneBlock = req.target?.tone ? `\n# 文体指定\n${req.target.tone}\n` : "";
  const audBlock = req.target?.audience ? `\n# 想定読者\n${req.target.audience}\n` : "";
  return [
    "あなたは編集部の若手ライターです。完成原稿ではなく、編集者があとで直す前提の荒い下書きを書きます。",
    "メモ1行を、自然な日本語の説明文へ膨らませてください。情報が足りなくても止まらず、推測でつないで構いません。",
    "ただし、推測や断定したくない事実は cautionNotes に「あとで要確認」として書き出してください。",
    `勢い: ${mode} — ${MODE_HINT[mode]}`,
    "出力は必ず次の JSON 形式（コードフェンス・前置き・解説禁止）。",
    `{"draftText":"本文候補","cautionNotes":["要確認事項1","要確認事項2"]}`,
    "ルール:",
    "- draftText は本文としてそのまま挿入可能な日本語の段落（箇条書き禁止）。",
    "- 「以下に説明します」「ここでは〜」などのAIっぽい前置きを書かない。",
    "- 既存本文の文体（敬体/常体）に合わせる。判別不能ならメモの語感に合わせる。",
    "- 推測した事実、固有名詞、数値、出典が必要そうな主張は cautionNotes に短く列挙する。",
    "- cautionNotes が無ければ空配列 [] を返す。",
    ctxBlock,
    recentBlock,
    toneBlock,
    audBlock,
    `\n# メモ\n${req.memo}\n\n# 出力（JSONのみ）`,
  ].join("\n");
}

export function parseMemoDraftJson(raw: string): MemoDraftResult {
  const cleaned = (raw || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a !== -1 && b > a) {
    const slice = cleaned.slice(a, b + 1);
    try {
      const obj = JSON.parse(slice) as unknown;
      if (obj && typeof obj === "object") {
        const o = obj as Record<string, unknown>;
        const draftText = typeof o.draftText === "string" ? o.draftText.trim() : "";
        const notesRaw = Array.isArray(o.cautionNotes) ? o.cautionNotes : [];
        const cautionNotes = notesRaw
          .map((n) => (typeof n === "string" ? n.trim() : ""))
          .filter((n) => n.length > 0);
        if (draftText) return { draftText, cautionNotes };
      }
    } catch {
      /* fallthrough */
    }
  }
  const fallback = cleaned || (raw || "").trim();
  return {
    draftText: fallback,
    cautionNotes: ["JSON形式で返らなかったため要確認"],
  };
}

// 共通フォールバック: adapter.expandMemoDraft が無い場合に chat / rewrite を使って生成する。
export async function expandMemoDraftViaAdapter(
  adapter: AIAdapter,
  req: MemoDraftRequest
): Promise<MemoDraftResult> {
  if (typeof adapter.expandMemoDraft === "function") {
    return adapter.expandMemoDraft(req);
  }
  const prompt = buildMemoDraftPrompt(req);
  try {
    if (typeof adapter.chat === "function") {
      const raw = await adapter.chat({ instruction: prompt, context: (req.content || "").slice(-800) });
      return parseMemoDraftJson(raw);
    }
  } catch {
    /* fallthrough to rewrite */
  }
  try {
    const raw = await adapter.rewrite({
      text: "",
      instruction: prompt,
      context: (req.content || "").slice(-800),
    });
    return parseMemoDraftJson(raw);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}
