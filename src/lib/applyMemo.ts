// メモ1行を原稿に反映するヒューリスティクス
// 戻り値: 新しい原稿テキストと、反映場所/モード
import type { MemoLine } from "./types";

export interface ApplyResult {
  newContent: string;
  applied: NonNullable<MemoLine["applied"]>;
}

const TOKEN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9]{2,}/gu;
const EDIT_INTENT_RE = /(修正|変更|削除|消して|消す|削って|やめて|短く|長く|やわらか|硬く|敬体|常体|直して|書き換え)/;

export function applyMemoToDoc(memoText: string, content: string, docId: string): ApplyResult {
  const memo = memoText.trim();
  if (!memo) {
    return {
      newContent: content,
      applied: { docId, range: { start: content.length, end: content.length }, mode: "insert", inserted: "" },
    };
  }

  // 1) 空の原稿 → そのまま挿入
  if (!content.trim()) {
    const inserted = memo;
    return {
      newContent: inserted,
      applied: { docId, range: { start: 0, end: inserted.length }, mode: "insert", inserted },
    };
  }

  // 2) "A→B" の明示置換は最優先
  const arrow = memo.match(/^(.+?)\s*(?:→|->|=>|に変更|を)\s*(.+?)(?:に変更|に修正|に直して)?$/);
  if (arrow) {
    const a = arrow[1].trim();
    const b = arrow[2].trim();
    if (a && b && a !== b && content.includes(a)) {
      const idx = content.indexOf(a);
      const newContent = content.slice(0, idx) + b + content.slice(idx + a.length);
      return {
        newContent,
        applied: { docId, range: { start: idx, end: idx + b.length }, mode: "replace", inserted: b },
      };
    }
  }

  // 3) 段落分割
  const paragraphs: { start: number; end: number; text: string }[] = [];
  {
    let s = 0;
    for (let i = 0; i <= content.length; i++) {
      if (i === content.length || content[i] === "\n") {
        paragraphs.push({ start: s, end: i, text: content.slice(s, i) });
        s = i + 1;
      }
    }
  }

  // 4) スコアリング
  const tokens = uniq(Array.from(memo.matchAll(TOKEN_RE), (m) => m[0]));
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (!p.text.trim()) continue;
    let score = 0;
    for (const t of tokens) if (p.text.includes(t)) score++;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const editIntent = EDIT_INTENT_RE.test(memo);

  // 5) 該当段落あり
  if (bestIdx >= 0 && bestScore > 0) {
    const p = paragraphs[bestIdx];
    if (editIntent) {
      // 編集意図 → 段落書き換え
      const rewritten = rewriteParagraph(p.text, memo);
      const newContent = content.slice(0, p.start) + rewritten + content.slice(p.end);
      return {
        newContent,
        applied: { docId, range: { start: p.start, end: p.start + rewritten.length }, mode: "replace", inserted: rewritten },
      };
    } else {
      // 補強 → 段落末尾に追記
      const sep = endsWithPeriod(p.text) ? "" : "。";
      const insertText = sep + cleanMemo(memo) + (endsWithPeriod(cleanMemo(memo)) ? "" : "。");
      const insertAt = p.end;
      const newContent = content.slice(0, insertAt) + insertText + content.slice(insertAt);
      return {
        newContent,
        applied: {
          docId,
          range: { start: insertAt, end: insertAt + insertText.length },
          mode: "append",
          inserted: insertText,
        },
      };
    }
  }

  // 6) 該当なし → 末尾に新規段落
  const prefix = content.endsWith("\n") ? "" : "\n";
  const inserted = prefix + memo;
  const insertAt = content.length;
  return {
    newContent: content + inserted,
    applied: {
      docId,
      range: { start: insertAt + prefix.length, end: insertAt + inserted.length },
      mode: "insert",
      inserted,
    },
  };
}

function rewriteParagraph(orig: string, memo: string): string {
  const cleaned = cleanMemo(memo);
  // "→" 形式が段落内で部分置換できるなら適用
  const arrow = memo.match(/(.+?)\s*(?:→|->|=>)\s*(.+)/);
  if (arrow) {
    const a = arrow[1].trim();
    const b = arrow[2].trim();
    if (a && b && orig.includes(a)) return orig.split(a).join(b);
  }
  // 「削除」「消して」 → 段落そのものを空に
  if (/(削除|消して|消す|削って|やめて)/.test(memo)) return "";
  // 既定: 段落末尾に注記として追加（書き換え扱い）
  const base = orig.replace(/[。．.！？!?]\s*$/, "");
  return base + "。（補足: " + cleaned + "）";
}

function cleanMemo(s: string): string {
  return s.replace(/^[\s・\-•]+/, "").trim();
}
function endsWithPeriod(s: string): boolean {
  return /[。．.！？!?]\s*$/.test(s.trimEnd());
}
function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
