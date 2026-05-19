// 全角=1, 半角=0.5 の簡易計算
export function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += isHalfWidth(ch) ? 0.5 : 1;
  }
  return w;
}

export function isHalfWidth(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  // ASCII + 半角カナ範囲
  if (code <= 0x007e) return true;
  if (code >= 0xff61 && code <= 0xff9f) return true;
  return false;
}

// 仮想行幅で折り返した結果（実改行ではなく表示用）
export function wrapByWidth(text: string, widthChars: number): string[] {
  const lines: string[] = [];
  // 実改行は段落の境界として尊重する
  for (const para of text.split("\n")) {
    if (para.length === 0) {
      lines.push("");
      continue;
    }
    let buf = "";
    let bufW = 0;
    for (const ch of para) {
      const cw = isHalfWidth(ch) ? 0.5 : 1;
      if (bufW + cw > widthChars && buf.length > 0) {
        lines.push(buf);
        buf = "";
        bufW = 0;
      }
      buf += ch;
      bufW += cw;
    }
    if (buf.length > 0) lines.push(buf);
  }
  return lines;
}
