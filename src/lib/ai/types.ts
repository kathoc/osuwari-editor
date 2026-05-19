import type { ApplyResult } from "../applyMemo";

export type AIAdapterId = "mock" | "ollama" | "chrome";

export interface AIAdapter {
  id: AIAdapterId;
  name: string;
  isAvailable(): Promise<boolean>;
  generateFromMemo(args: { memo: string; content: string; docId: string }): Promise<ApplyResult>;
  chat(args: { instruction: string; context: string }): Promise<string>;
  rewrite(args: {
    text: string;
    instruction: string;
    constraint?: { widthChars?: number; maxLines?: number; maxChars?: number };
    context?: string;
  }): Promise<string>;
  // 1センテンス分のルビ生成。漢字語と読みのペアを返す。未実装なら空配列。
  generateRuby?(args: { sentence: string }): Promise<Array<{ base: string; kana: string }>>;
}
