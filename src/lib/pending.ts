import type { PendingProposal } from "./types";
import type { AIAdapter } from "./ai/types";

export interface SingleDiff {
  changeStart: number;
  oldEnd: number;
  newEnd: number;
  delta: number;
}

// prev → next の単一連続編集とみなして共通接頭辞・接尾辞から差分を求める
export function diffSingle(prev: string, next: string): SingleDiff {
  let a = 0;
  const minLen = Math.min(prev.length, next.length);
  while (a < minLen && prev.charCodeAt(a) === next.charCodeAt(a)) a++;
  let b = 0;
  while (
    b < Math.min(prev.length - a, next.length - a) &&
    prev.charCodeAt(prev.length - 1 - b) === next.charCodeAt(next.length - 1 - b)
  ) {
    b++;
  }
  return {
    changeStart: a,
    oldEnd: prev.length - b,
    newEnd: next.length - b,
    delta: next.length - prev.length,
  };
}

// 編集差分を踏まえて pending の位置と manualEdited を更新する
export function shiftPending(p: PendingProposal, d: SingleDiff): PendingProposal {
  if (d.delta === 0 && d.changeStart === d.oldEnd) return p;
  if (d.oldEnd <= p.start) {
    return { ...p, start: p.start + d.delta, end: p.end + d.delta };
  }
  if (d.changeStart >= p.end) {
    return p;
  }
  // 重なり: 範囲内で手動編集された
  const newEnd = Math.max(p.start, p.end + d.delta);
  return { ...p, end: newEnd, manuallyEdited: true };
}

// 指示文を再利用しやすい短いラベルへ要約
export async function summarizeInstruction(adapter: AIAdapter, instruction: string): Promise<string> {
  const inst = instruction.trim();
  if (inst.length <= 8) return inst;
  // mock では LLM 要約が安定しないので単純トリム
  if (adapter.id === "mock") {
    return inst.slice(0, 6);
  }
  try {
    const raw = await adapter.chat({
      instruction:
        "次の指示文を、再利用しやすい短いラベル(2〜6文字、名詞句、句点なし、説明文なし)に要約してください。" +
        "出力はラベル文字列のみで、前置きや引用符を付けないこと。\n指示: " +
        inst,
      context: "",
    });
    const cleaned = raw
      .replace(/```[\s\S]*?```/g, "")
      .split("\n")[0]
      .replace(/^[「『"']|[」』"']$/g, "")
      .replace(/[。．、,.\s]+$/g, "")
      .trim();
    if (!cleaned) return inst.slice(0, 6);
    return cleaned.length > 10 ? cleaned.slice(0, 10) : cleaned;
  } catch {
    return inst.slice(0, 6);
  }
}
