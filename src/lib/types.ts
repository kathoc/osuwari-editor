export type Mode = "draft" | "edit";
export type Theme = "light" | "dark" | "oled" | "sepia" | "system";

export interface VirtualLayout {
  widthChars: number;
  maxLines: number;
}

export interface AISettings {
  id: "mock" | "ollama" | "chrome";
  ollama?: {
    baseUrl?: string;
    model?: string;
  };
}

export type AISendKey = "enter" | "ctrl-enter";

export interface Profile {
  fontSize: number;
  lineHeight: number;
  theme: Theme;
  virtual: VirtualLayout;
  mode: Mode;
  ai?: AISettings;
  aiSendKey?: AISendKey;
  longUsedFontSize?: number;
  // メモ→AI連携（行確定で差し込み提案を生成）
  memoSuggestEnabled?: boolean;
  // メモ駆動オート執筆（実験）
  memoAutoWriteEnabled?: boolean;
  // メモ駆動オート草稿（助手草稿）
  memoDraftEnabled?: boolean;
  memoDraftMode?: "safe" | "normal" | "wild";
}

export type StyleRule = "off" | "desu-masu" | "da-dearu" | "dayo-nanda";

export interface DocumentSettings {
  rubyVisible?: boolean | null;
  styleRule?: StyleRule | null;
}

export interface ManualRubyEntry {
  base: string;
  kana: string;
}

export interface DocumentState {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  cursor: number;
  scrollTop: number;
  sourcePath?: string | null;
  projectId?: string | null;
  settings?: DocumentSettings | null;
  // 手動で設定したルビ。本文には書き込まず、表示時に重ねる。
  manualRuby?: ManualRubyEntry[];
}

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: number;
  chars: number;
  sourcePath?: string | null;
  projectId?: string | null;
}

export interface Project {
  id: string;
  name: string;
  rubyVisible: boolean;
  styleRule: StyleRule;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  docCount: number;
}

export interface EffectiveSettings {
  rubyVisible: boolean;
  styleRule: StyleRule;
  source: { rubyVisible: "doc" | "project" | "default"; styleRule: "doc" | "project" | "default" };
}

export type EditOpType = "insert" | "delete" | "replace" | "aiApply";

export interface EditOp {
  id: string;
  documentId?: string;
  ts: number;
  type: EditOpType;
  before: { start: number; end: number; text: string };
  after: { start: number; end: number; text: string };
  source: "user" | "ai" | "autoFix";
}

export interface Highlight {
  start: number;
  end: number;
  kind:
    | "punct-dup"
    | "ending-streak"
    | "word-streak"
    | "ruby"
    | "style-rule"
    | "pending-ai"
    | "search-match"
    | "search-current";
  message: string;
  // 改善後の具体的な置換テキスト or 言い換え候補（pre-wrap で表示される）
  suggestion?: string;
}

export interface PendingProposal {
  id: string;
  start: number;
  end: number;
  before: string;
  after: string;
  instruction: string;
  manuallyEdited: boolean;
  createdAt: number;
}

export interface Snapshot {
  id: string;
  documentId: string;
  label: string;
  content: string;
  title: string;
  createdAt: number;
}

export interface MemoLine {
  id: string;
  text: string;
  status: "pending" | "applied" | "failed";
  createdAt: number;
  applied?: {
    docId: string;
    range: { start: number; end: number };
    mode: "replace" | "append" | "insert";
    inserted: string;
  };
}

export interface MemoDraftProposal {
  id: string;
  memo: string;
  draftText: string;
  cautionNotes: string[];
  status: "pending" | "ready" | "applied" | "rejected" | "failed";
  mode?: "safe" | "normal" | "wild";
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AIProposal {
  id: string;
  instruction: string;
  proposalText: string;
  status: "preview" | "applied" | "rejected";
  createdAt: number;
}
