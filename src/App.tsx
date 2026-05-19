import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, type EditorHandle } from "./components/Editor";
import { StatusBar } from "./components/StatusBar";
import { DocTabs } from "./components/DocTabs";
import { MemoNotebook, type AppliedSentence } from "./components/MemoNotebook";
import { MemoDraftPanel } from "./components/MemoDraftPanel";
import { RewritePanel } from "./components/RewritePanel";
import { RubyPanel } from "./components/RubyPanel";
import { SnapshotsPanel } from "./components/SnapshotsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toolbar } from "./components/Toolbar";
import { SearchPanel, type Match, type SearchOptions } from "./components/SearchPanel";
import { useTheme } from "./hooks/useTheme";
import { useDeferredAnalyze } from "./hooks/useDeferredAnalyze";
import { useFurigana } from "./hooks/useFurigana";
import {
  appendOp,
  createDoc,
  createProject,
  deleteDoc,
  deleteProject,
  getProject,
  listDocs,
  listProjects,
  loadDocById,
  loadMemoDrafts,
  loadProfile,
  newId,
  saveDoc,
  saveMemoDrafts,
  saveProfile,
  updateProject,
} from "./lib/storage";
import { getAdapter } from "./lib/ai/registry";
import { expandMemoDraftViaAdapter } from "./lib/ai/memoDraft";
import { effectiveSettings } from "./lib/settings";
import type {
  DocumentSettings,
  DocumentState,
  DocumentSummary,
  Highlight,
  MemoDraftProposal,
  PendingProposal,
  Profile,
  Project,
  ProjectSummary,
} from "./lib/types";
import { currentParagraph } from "./lib/analyze";
import type { RubyReading } from "./lib/analyze";
import { diffSingle, shiftPending } from "./lib/pending";

const ACTIVE_KEY = "osuwari.activeDocId";
const FOCUS_KEY = "osuwari.focusMode";
const CHAT_OPEN_KEY = "osuwari.chatOpen";
const SIDE_TAB_KEY = "osuwari.sideTab";
const MEMO_KEY_PREFIX = "osuwari.memoboard.v1:";

interface MemoBoard {
  text: string;
  applied: AppliedSentence[];
}

function loadBoard(docId: string): MemoBoard {
  try {
    const raw = localStorage.getItem(MEMO_KEY_PREFIX + docId);
    if (raw) return JSON.parse(raw) as MemoBoard;
  } catch {}
  return { text: "", applied: [] };
}
function saveBoard(docId: string, board: MemoBoard) {
  try { localStorage.setItem(MEMO_KEY_PREFIX + docId, JSON.stringify(board)); } catch {}
}

const defaultProfile: Profile = {
  fontSize: 16,
  lineHeight: 1.8,
  theme: "system",
  virtual: { widthChars: 30, maxLines: 4 },
  mode: "draft",
};

function makeDefaultDoc(): DocumentState {
  return {
    id: "default",
    title: "無題",
    content: "",
    updatedAt: Date.now(),
    cursor: 0,
    scrollTop: 0,
    sourcePath: null,
  };
}

export default function App() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [doc, setDoc] = useState<DocumentState>(makeDefaultDoc);
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [focusMode, setFocusMode] = useState<boolean>(() => localStorage.getItem(FOCUS_KEY) === "1");
  const [chatOpen, setChatOpen] = useState<boolean>(() => localStorage.getItem(CHAT_OPEN_KEY) !== "0");
  const [isMobile, setIsMobile] = useState<boolean>(() => window.matchMedia("(max-width: 720px)").matches);
  const [sideTab, setSideTab] = useState<"memo" | "ai" | "ruby" | "history" | "settings">(() => {
    const raw = localStorage.getItem(SIDE_TAB_KEY);
    if (raw === "memo" || raw === "ai" || raw === "ruby" || raw === "history" || raw === "settings") return raw;
    if (raw === "rewrite") return "ai";
    return "memo";
  });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [board, setBoard] = useState<MemoBoard>({ text: "", applied: [] });
  const [memoBusy, setMemoBusy] = useState(false);
  const [flashRange, setFlashRange] = useState<{ start: number; end: number; token: number } | null>(null);
  const [aiStatus, setAiStatus] = useState<{ ok: boolean; label: string }>({ ok: true, label: "mock" });
  const [pending, setPending] = useState<PendingProposal[]>([]);
  const [memoDrafts, setMemoDrafts] = useState<MemoDraftProposal[]>([]);
  const [aiPrefill, setAiPrefill] = useState<{ text: string; token: number } | null>(null);
  const editorApi = useRef<EditorHandle>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState<{ open: boolean; opts: SearchOptions; matches: Match[]; current: number }>(
    { open: false, opts: { query: "", replace: "", useRegex: false, caseSensitive: false, mode: "find" }, matches: [], current: 0 }
  );

  const adapter = useMemo(() => getAdapter(profile), [profile]);
  const adapterRef = useRef(adapter);
  useEffect(() => { adapterRef.current = adapter; }, [adapter]);
  const docRef = useRef(doc);
  useEffect(() => { docRef.current = doc; }, [doc]);
  const boardRef = useRef(board);
  // boardRef は board state 宣言の後で実体が作られるため、後段の useEffect で同期する。

  // AI 接続チェック
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await adapter.isAvailable();
      if (cancelled) return;
      setAiStatus({ ok, label: ok ? adapter.id : `${adapter.id} 切断` });
    })();
    return () => { cancelled = true; };
  }, [adapter]);

  const recheckAI = async () => {
    const ok = await adapter.isAvailable();
    setAiStatus({ ok, label: ok ? adapter.id : `${adapter.id} 切断` });
  };

  // 滞在記憶ズーム: fontSize が長時間（5分）同じだったら longUsedFontSize を更新
  const fontSizeChangedAt = useRef(Date.now());
  useEffect(() => {
    fontSizeChangedAt.current = Date.now();
  }, [profile.fontSize]);
  useEffect(() => {
    const i = window.setInterval(() => {
      const dwell = Date.now() - fontSizeChangedAt.current;
      if (dwell > 5 * 60 * 1000 && profile.longUsedFontSize !== profile.fontSize) {
        setProfile((p) => ({ ...p, longUsedFontSize: p.fontSize }));
      }
    }, 60 * 1000);
    return () => window.clearInterval(i);
  }, [profile.fontSize, profile.longUsedFontSize]);

  useTheme(profile.theme);

  // モバイル判定
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 720px)");
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // 集中モードのキーバインド (F8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        setFocusMode((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    localStorage.setItem(FOCUS_KEY, focusMode ? "1" : "0");
  }, [focusMode]);
  useEffect(() => {
    localStorage.setItem(CHAT_OPEN_KEY, chatOpen ? "1" : "0");
  }, [chatOpen]);

  // 起動時: profile + 原稿一覧 + プロジェクト一覧 + 直近アクティブ原稿
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, list, projs] = await Promise.all([loadProfile(), listDocs(), listProjects()]);
      if (cancelled) return;
      if (p) setProfile(p);
      setProjects(projs);
      const activeId = localStorage.getItem(ACTIVE_KEY) || list[0]?.id || "default";
      const d = await loadDocById(activeId);
      if (cancelled) return;
      setDocs(list);
      if (d) {
        setDoc(d);
        setSavedAt(d.updatedAt || null);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // ドキュメントの projectId が変わったら currentProject をロード
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!doc.projectId) {
        setCurrentProject(null);
        return;
      }
      const p = await getProject(doc.projectId);
      if (!cancelled) setCurrentProject(p);
    })();
    return () => { cancelled = true; };
  }, [doc.projectId]);

  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(() => saveProfile(profile), 200);
    return () => window.clearTimeout(t);
  }, [profile, loaded]);

  const saveTimer = useRef<number | null>(null);
  const prevContent = useRef<string>(doc.content);
  const prevDocId = useRef<string>(doc.id);

  useEffect(() => {
    if (prevDocId.current !== doc.id) {
      prevDocId.current = doc.id;
      prevContent.current = doc.content;
    }
  }, [doc.id, doc.content]);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const next: DocumentState = { ...doc, updatedAt: Date.now() };
      await saveDoc(next);
      setSavedAt(next.updatedAt);
      if (prevContent.current !== doc.content) {
        appendOp({
          id: newId(),
          documentId: doc.id,
          ts: Date.now(),
          type: "replace",
          before: { start: 0, end: prevContent.current.length, text: "" },
          after: { start: 0, end: doc.content.length, text: "" },
          source: "user",
        });
        prevContent.current = doc.content;
      }
      // タブ位置を維持するため、既存項目は配列内の位置を保ったまま更新し、新規のみ末尾に追加。
      setDocs((xs) =>
        xs.some((x) => x.id === next.id)
          ? xs.map((x) =>
              x.id === next.id
                ? { ...x, title: next.title, updatedAt: next.updatedAt, chars: next.content.length, sourcePath: next.sourcePath ?? null }
                : x
            )
          : xs.concat([{ id: next.id, title: next.title, updatedAt: next.updatedAt, chars: next.content.length, sourcePath: next.sourcePath ?? null }])
      );
    }, 250);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [doc, loaded]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, doc.id);
    setBoard(loadBoard(doc.id));
  }, [doc.id]);

  useEffect(() => {
    localStorage.setItem(SIDE_TAB_KEY, sideTab);
  }, [sideTab]);

  useEffect(() => {
    if (!loaded) return;
    saveBoard(doc.id, board);
  }, [board, doc.id, loaded]);

  useEffect(() => { boardRef.current = board; }, [board]);

  // ドキュメント切替時に助手草稿をロード（in-flight はリクエスト世代でガード）
  const memoDraftDocRef = useRef<string>(doc.id);
  useEffect(() => {
    let cancelled = false;
    memoDraftDocRef.current = doc.id;
    (async () => {
      const list = await loadMemoDrafts(doc.id);
      if (cancelled) return;
      // 前回 in-flight だった pending はリロード後に復元しない（再生成ボタンから明示する）
      const normalized = list.map((d) => (d.status === "pending" ? { ...d, status: "failed" as const, errorMessage: "中断" } : d));
      setMemoDrafts(normalized);
    })();
    return () => { cancelled = true; };
  }, [doc.id]);

  useEffect(() => {
    if (!loaded) return;
    void saveMemoDrafts(doc.id, memoDrafts);
  }, [memoDrafts, doc.id, loaded]);

  // 改行で1行確定 → AI 経由で原稿生成・反映
  async function commitMemoLine(line: string) {
    const memoLine = line.trim();
    if (!memoLine || memoBusy) return;
    setMemoBusy(true);
    try {
      const result = await adapter.generateFromMemo({ memo: memoLine, content: doc.content, docId: doc.id });
      // 原稿を更新
      setDoc((d) => ({ ...d, content: result.newContent, cursor: result.applied.range.end }));
      appendOp({
        id: newId(),
        documentId: doc.id,
        ts: Date.now(),
        type: result.applied.mode === "replace" ? "replace" : "insert",
        before: { start: result.applied.range.start, end: result.applied.range.start, text: "" },
        after: { start: result.applied.range.start, end: result.applied.range.end, text: result.applied.inserted },
        source: "ai",
      });
      const appliedItem: AppliedSentence = {
        id: newId(),
        sentence: memoLine,
        docRange: { start: result.applied.range.start, end: result.applied.range.end },
        createdAt: Date.now(),
      };
      setBoard((b) => ({ text: b.text, applied: b.applied.concat([appliedItem]) }));
      setFlashRange({ ...result.applied.range, token: Date.now() });
    } finally {
      setMemoBusy(false);
    }
  }

  function clickAppliedMark(a: AppliedSentence) {
    setFlashRange({ ...a.docRange, token: Date.now() });
  }

  // メモ全体を原稿化（末尾追記）
  async function compileMemos() {
    if (memoBusy || !board.text.trim()) return;
    setMemoBusy(true);
    try {
      const result = await adapter.rewrite({
        text: board.text,
        instruction:
          "次の取材メモを統合し、自然な日本語の原稿として書き起こしてください。前置きや見出しは付けず、本文だけを出力してください。",
        context: doc.content.slice(-600),
      });
      if (!result.trim()) return;
      const insertAt = doc.content.length;
      const prefix = doc.content.endsWith("\n") || doc.content.length === 0 ? "" : "\n\n";
      const inserted = prefix + result;
      setDoc((d) => ({ ...d, content: d.content + inserted, cursor: insertAt + inserted.length }));
      appendOp({
        id: newId(),
        documentId: doc.id,
        ts: Date.now(),
        type: "insert",
        before: { start: insertAt, end: insertAt, text: "" },
        after: { start: insertAt, end: insertAt + inserted.length, text: inserted },
        source: "ai",
      });
      setFlashRange({ start: insertAt + prefix.length, end: insertAt + inserted.length, token: Date.now() });
    } finally {
      setMemoBusy(false);
    }
  }

  // メモ駆動オート執筆（実験機能）
  // メモが書かれている時、デバウンスで原稿全体を AI に生成・更新させる。
  // ・空原稿時: 200字前後のドラフトを生成
  // ・既存原稿時: メモを踏まえてリライト（直前のオート生成のみ上書き、手書きはロック）
  const autoWriteState = useRef<{ lastMemoSig: string; lastAutoRange: { start: number; end: number } | null }>({
    lastMemoSig: "",
    lastAutoRange: null,
  });
  const autoWriteBusy = useRef(false);
  useEffect(() => {
    if (!profile.memoAutoWriteEnabled) return;
    if (!loaded) return;
    const memo = board.text.trim();
    if (!memo) return;
    const sig = memo;
    if (sig === autoWriteState.current.lastMemoSig) return;
    const t = window.setTimeout(async () => {
      if (autoWriteBusy.current) return;
      autoWriteBusy.current = true;
      try {
        autoWriteState.current.lastMemoSig = sig;
        const lines = memo.split(/\n+/).filter((l) => l.trim());
        const isFirst = lines.length <= 1 || !autoWriteState.current.lastAutoRange;
        const targetLen = Math.min(2000, 200 + (lines.length - 1) * 180);
        const last = autoWriteState.current.lastAutoRange;
        const existing = last ? doc.content.slice(last.start, last.end) : "";
        const instruction = isFirst
          ? `次のメモから推定できるジャンル（小説/技術記事/取材記事/レビュー/ルポ 等）を判断し、${targetLen}字程度の原稿冒頭を1本書いてください。前置きや見出しは不要。本文だけ。`
          : `次のメモは原稿のネタ帳です。行が増えるごとに内容が具体化しています。最新のメモ全体から最適なジャンルを再判断し、既存の自動生成原稿を、より詳細で一貫性のある${targetLen}字程度の本文へ書き直してください。前置き不要。本文のみ。`;
        const context = isFirst ? `# メモ\n${memo}` : `# メモ\n${memo}\n\n# 既存の自動生成原稿\n${existing}`;
        const out = (await adapter.rewrite({ text: existing, instruction, context })).trim();
        if (!out) return;
        setDoc((d) => {
          if (last && d.content.slice(last.start, last.end) === existing) {
            const next = d.content.slice(0, last.start) + out + d.content.slice(last.end);
            autoWriteState.current.lastAutoRange = { start: last.start, end: last.start + out.length };
            return { ...d, content: next, cursor: last.start + out.length };
          }
          // 初回 or 既存範囲が手書き編集された場合は末尾追記
          const insertAt = d.content.length;
          const prefix = d.content.length === 0 || d.content.endsWith("\n") ? "" : "\n\n";
          const next = d.content + prefix + out;
          autoWriteState.current.lastAutoRange = { start: insertAt + prefix.length, end: insertAt + prefix.length + out.length };
          return { ...d, content: next, cursor: next.length };
        });
        const r = autoWriteState.current.lastAutoRange;
        if (r) setFlashRange({ start: r.start, end: r.end, token: Date.now() });
      } catch (e) {
        console.warn("auto-write failed", e);
      } finally {
        autoWriteBusy.current = false;
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [board.text, profile.memoAutoWriteEnabled, loaded, adapter, doc.id]);

  // 原稿IDが変わったらオート執筆の追跡状態をリセット
  useEffect(() => {
    autoWriteState.current = { lastMemoSig: "", lastAutoRange: null };
  }, [doc.id]);

  // AI 候補をエディタへ仮反映: 選択範囲を提案文で置き換え、pending として保持
  async function runAIRewrite(instruction: string, sel: { start: number; end: number; text: string }) {
    try {
      const result = await adapter.rewrite({
        text: sel.text,
        instruction,
        context: doc.content.slice(Math.max(0, sel.start - 300), sel.start) +
          " … " +
          doc.content.slice(sel.end, sel.end + 200),
      });
      const after = (result || "").trim();
      if (!after || after === sel.text) return;
      const id = newId();
      setDoc((d) => {
        const next = d.content.slice(0, sel.start) + after + d.content.slice(sel.end);
        return { ...d, content: next, cursor: sel.start + after.length };
      });
      setPending((ps) => {
        // 先行 pending の位置を新挿入の delta で補正してから追加
        const delta = after.length - (sel.end - sel.start);
        const shifted = ps.map((p) =>
          p.start >= sel.end
            ? { ...p, start: p.start + delta, end: p.end + delta }
            : p
        );
        return [
          ...shifted,
          {
            id,
            start: sel.start,
            end: sel.start + after.length,
            before: sel.text,
            after,
            instruction,
            manuallyEdited: false,
            createdAt: Date.now(),
          },
        ];
      });
      setFlashRange({ start: sel.start, end: sel.start + after.length, token: Date.now() });
    } catch (e) {
      // 失敗時は何もしない（パネル側で busy が解除される）
      console.warn("AI rewrite failed", e);
    }
  }

  // 選択なしでカーソル位置に AI 生成テキストを差し込み（pending として保持）
  async function runAIGenerate(instruction: string) {
    try {
      const insertAt = Math.max(0, Math.min(doc.cursor ?? doc.content.length, doc.content.length));
      const result = await adapter.rewrite({
        text: "",
        instruction,
        context:
          doc.content.slice(Math.max(0, insertAt - 400), insertAt) +
          " … " +
          doc.content.slice(insertAt, insertAt + 200),
      });
      const after = (result || "").trim();
      if (!after) return;
      const id = newId();
      const prefix = insertAt === 0 || /[\n]/.test(doc.content.slice(insertAt - 1, insertAt)) ? "" : "";
      const inserted = prefix + after;
      setDoc((d) => {
        const next = d.content.slice(0, insertAt) + inserted + d.content.slice(insertAt);
        return { ...d, content: next, cursor: insertAt + inserted.length };
      });
      setPending((ps) => {
        const delta = inserted.length;
        const shifted = ps.map((p) =>
          p.start >= insertAt ? { ...p, start: p.start + delta, end: p.end + delta } : p
        );
        return [
          ...shifted,
          {
            id,
            start: insertAt,
            end: insertAt + inserted.length,
            before: "",
            after: inserted,
            instruction,
            manuallyEdited: false,
            createdAt: Date.now(),
          },
        ];
      });
      setFlashRange({ start: insertAt, end: insertAt + inserted.length, token: Date.now() });
    } catch (e) {
      console.warn("AI generate failed", e);
    }
  }

  // メモ→AI差し込み提案: 原稿に既存内容がある時、AIが挿入位置と内容を判断して pending として表示
  async function commitMemoLineAsSuggestion(line: string) {
    const memoLine = line.trim();
    if (!memoLine || memoBusy) return;
    setMemoBusy(true);
    try {
      const result = await adapter.generateFromMemo({ memo: memoLine, content: doc.content, docId: doc.id });
      const ins = result.applied.inserted;
      if (!ins) return;
      const insertAt = result.applied.range.start;
      const replaceEnd = result.applied.mode === "replace" ? result.applied.range.start + (result.applied.range.end - result.applied.range.start - ins.length) : insertAt;
      // 差し込み提案: 本文を直接書き換えるのではなく、pending に乗せる形で挿入
      const before = result.applied.mode === "replace" ? doc.content.slice(insertAt, insertAt + (result.applied.range.end - result.applied.range.start)) : "";
      const id = newId();
      setDoc((d) => ({ ...d, content: result.newContent, cursor: result.applied.range.end }));
      setPending((ps) => {
        const delta = ins.length - before.length;
        const shifted = ps.map((p) =>
          p.start >= replaceEnd ? { ...p, start: p.start + delta, end: p.end + delta } : p
        );
        return [
          ...shifted,
          {
            id,
            start: insertAt,
            end: insertAt + ins.length,
            before,
            after: ins,
            instruction: `メモ: ${memoLine}`,
            manuallyEdited: false,
            createdAt: Date.now(),
          },
        ];
      });
      const appliedItem: AppliedSentence = {
        id: newId(),
        sentence: memoLine,
        docRange: { start: insertAt, end: insertAt + ins.length },
        createdAt: Date.now(),
      };
      setBoard((b) => ({ text: b.text, applied: b.applied.concat([appliedItem]) }));
      setFlashRange({ start: insertAt, end: insertAt + ins.length, token: Date.now() });
    } finally {
      setMemoBusy(false);
    }
  }

  // --- メモ駆動オート草稿（助手草稿）---------------------------------------
  function recentMemosFromBoard(): string[] {
    const text = boardRef.current?.text || "";
    return text
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(-5);
  }

  async function runMemoDraft(id: string, memo: string) {
    const docIdAtStart = docRef.current.id;
    const mode = profile.memoDraftMode || "normal";
    try {
      const result = await expandMemoDraftViaAdapter(adapterRef.current, {
        memo,
        content: (docRef.current.content || "").slice(-1500),
        recentMemos: recentMemosFromBoard(),
        mode,
      });
      if (memoDraftDocRef.current !== docIdAtStart) return; // doc 切替で破棄
      setMemoDrafts((xs) =>
        xs.map((d) =>
          d.id === id
            ? {
                ...d,
                status: "ready",
                draftText: result.draftText,
                cautionNotes: result.cautionNotes,
                updatedAt: Date.now(),
              }
            : d
        )
      );
    } catch (e) {
      if (memoDraftDocRef.current !== docIdAtStart) return;
      setMemoDrafts((xs) =>
        xs.map((d) =>
          d.id === id
            ? {
                ...d,
                status: "failed",
                errorMessage: e instanceof Error ? e.message : String(e),
                updatedAt: Date.now(),
              }
            : d
        )
      );
    }
  }

  function handleMemoDraft(line: string) {
    const memo = line.trim();
    if (!memo) return;
    const id = newId();
    const now = Date.now();
    const draft: MemoDraftProposal = {
      id,
      memo,
      draftText: "",
      cautionNotes: [],
      status: "pending",
      mode: profile.memoDraftMode || "normal",
      createdAt: now,
      updatedAt: now,
    };
    setMemoDrafts((xs) => xs.concat([draft]));
    void runMemoDraft(id, memo);
  }

  function applyMemoDraft(id: string) {
    const target = memoDrafts.find((d) => d.id === id);
    if (!target || target.status !== "ready" || !target.draftText) return;
    const insertAt = doc.content.length;
    const prefix = doc.content.length === 0 || doc.content.endsWith("\n") ? "" : "\n\n";
    const inserted = prefix + target.draftText;
    setDoc((d) => ({ ...d, content: d.content + inserted, cursor: insertAt + inserted.length }));
    appendOp({
      id: newId(),
      documentId: doc.id,
      ts: Date.now(),
      type: "insert",
      before: { start: insertAt, end: insertAt, text: "" },
      after: { start: insertAt, end: insertAt + inserted.length, text: inserted },
      source: "ai",
    });
    setMemoDrafts((xs) => xs.map((d) => (d.id === id ? { ...d, status: "applied", updatedAt: Date.now() } : d)));
    setFlashRange({ start: insertAt + prefix.length, end: insertAt + inserted.length, token: Date.now() });
  }

  function rejectMemoDraft(id: string) {
    setMemoDrafts((xs) => xs.filter((d) => d.id !== id));
  }

  function retryMemoDraft(id: string) {
    const target = memoDrafts.find((d) => d.id === id);
    if (!target) return;
    setMemoDrafts((xs) =>
      xs.map((d) =>
        d.id === id
          ? { ...d, status: "pending", draftText: "", cautionNotes: [], errorMessage: undefined, updatedAt: Date.now() }
          : d
      )
    );
    void runMemoDraft(id, target.memo);
  }

  // メモタブの内容を AI タブのプロンプトに転記して送る（実行はユーザー操作）
  function sendMemoToAI(text: string) {
    const t = text.trim();
    if (!t) return;
    setAiPrefill({ text: t, token: Date.now() });
    setSideTab("ai");
  }

  function commitAllPending() {
    if (pending.length === 0) return;
    // 内容は既に反映済み(手動編集があってもそれが優先)。op として記録しつつ pending を解除。
    for (const p of pending) {
      const currentText = doc.content.slice(p.start, p.end);
      appendOp({
        id: newId(),
        documentId: doc.id,
        ts: Date.now(),
        type: "replace",
        before: { start: p.start, end: p.start + p.before.length, text: p.before },
        after: { start: p.start, end: p.end, text: currentText },
        source: p.manuallyEdited ? "user" : "ai",
      });
    }
    setPending([]);
  }

  function discardPending(id: string) {
    setPending((ps) => {
      const target = ps.find((x) => x.id === id);
      if (!target) return ps;
      const currentText = doc.content.slice(target.start, target.end);
      const delta = target.before.length - currentText.length;
      setDoc((d) => ({
        ...d,
        content: d.content.slice(0, target.start) + target.before + d.content.slice(target.end),
        cursor: target.start + target.before.length,
      }));
      return ps
        .filter((x) => x.id !== id)
        .map((other) =>
          other.start >= target.end
            ? { ...other, start: other.start + delta, end: other.end + delta }
            : other
        );
    });
  }

  // 選択範囲の語に対し、本文を変更せず手動ルビ辞書に登録する。
  // 同じ base がある場合は kana を更新。
  function applyManualRuby(range: { start: number; end: number }, kana: string) {
    const k = kana.trim();
    if (!k) return;
    const base = doc.content.slice(range.start, range.end);
    if (!base) return;
    setDoc((d) => {
      const list = d.manualRuby || [];
      const idx = list.findIndex((e) => e.base === base);
      const next = idx >= 0 ? list.map((e, i) => (i === idx ? { base, kana: k } : e)) : [...list, { base, kana: k }];
      return { ...d, manualRuby: next };
    });
  }

  // 選択範囲に該当する手動ルビ辞書のエントリを削除（本文は触らない）
  function removeManualRuby(range: { start: number; end: number }) {
    const selText = doc.content.slice(range.start, range.end);
    if (!selText) return;
    setDoc((d) => {
      const list = d.manualRuby || [];
      const next = list.filter((e) => e.base !== selText && !selText.includes(e.base));
      if (next.length === list.length) return d;
      return { ...d, manualRuby: next };
    });
  }

  // エディタの onChange を仲介: 差分から pending の位置と手書き編集フラグを更新
  function handleEditorChange(next: string, cursor: number) {
    const prev = doc.content;
    if (pending.length > 0 && prev !== next) {
      const d = diffSingle(prev, next);
      setPending((ps) => ps.map((p) => shiftPending(p, d)));
    }
    setDoc((d) => ({ ...d, content: next, cursor }));
  }

  // メモ本文が変わったら、本文に存在しなくなった applied は破棄
  function updateMemoText(next: string) {
    setBoard((b) => {
      const stillThere = b.applied.filter((a) => next.includes(a.sentence));
      return { text: next, applied: stillThere };
    });
  }

  const effSettings = useMemo(
    () => effectiveSettings(doc.settings, currentProject),
    [doc.settings, currentProject]
  );
  const highlights = useDeferredAnalyze(doc.content, profile.mode, effSettings.styleRule);
  const manualOverrideReadings = useMemo<RubyReading[]>(() => {
    const out: RubyReading[] = [];
    const list = doc.manualRuby || [];
    for (const entry of list) {
      if (!entry.base) continue;
      let pos = 0;
      while (true) {
        const idx = doc.content.indexOf(entry.base, pos);
        if (idx === -1) break;
        out.push({ start: idx, end: idx + entry.base.length, kana: entry.kana, manual: true });
        pos = idx + entry.base.length;
      }
    }
    return out;
  }, [doc.content, doc.manualRuby]);
  const manualBases = useMemo(
    () => (doc.manualRuby || []).map((e) => e.base),
    [doc.manualRuby]
  );
  const furigana = useFurigana(doc.content, effSettings.rubyVisible, adapter, manualBases);
  // 自動ルビは手動オーバーライドと重なるものを除外
  const effectiveReadings = useMemo<RubyReading[]>(() => {
    const out: RubyReading[] = [...manualOverrideReadings];
    for (const r of furigana.readings) {
      const overlap = manualOverrideReadings.some((m) => r.start < m.end && r.end > m.start);
      if (!overlap) out.push(r);
    }
    return out.sort((a, b) => a.start - b.start);
  }, [furigana.readings, manualOverrideReadings]);
  const highlightsWithPending = useMemo<Highlight[]>(() => {
    const list: Highlight[] = [...highlights];
    for (const p of pending) {
      list.push({
        start: p.start,
        end: p.end,
        kind: "pending-ai" as const,
        message: `AI候補（未確定）: ${p.instruction}${p.manuallyEdited ? "\n手書きで上書き済み（確定時はこの内容が優先されます）" : ""}`,
      });
    }
    if (search.open && search.matches.length > 0) {
      for (let i = 0; i < search.matches.length; i++) {
        const m = search.matches[i];
        list.push({
          start: m.start,
          end: m.end,
          kind: i === search.current ? ("search-current" as const) : ("search-match" as const),
          message: "",
        });
      }
    }
    return list;
  }, [highlights, pending, search.open, search.matches, search.current]);
  const para = useMemo(() => currentParagraph(doc.content, doc.cursor), [doc.content, doc.cursor]);

  // プロジェクト操作
  async function setDocProject(projectId: string | null) {
    setDoc((d) => ({ ...d, projectId }));
  }
  function setDocSettings(next: DocumentSettings | null) {
    setDoc((d) => ({ ...d, settings: next }));
  }
  async function createProj(name: string): Promise<Project | null> {
    const created = await createProject({ name, rubyVisible: true, styleRule: "off" });
    if (created) {
      const list = await listProjects();
      setProjects(list);
    }
    return created;
  }
  async function updateProj(id: string, patch: Partial<Project>): Promise<void> {
    await updateProject(id, patch);
    const list = await listProjects();
    setProjects(list);
    if (currentProject?.id === id) {
      const fresh = await getProject(id);
      setCurrentProject(fresh);
    }
  }
  async function deleteProj(id: string): Promise<void> {
    await deleteProject(id);
    const list = await listProjects();
    setProjects(list);
    if (doc.projectId === id) setDoc((d) => ({ ...d, projectId: null }));
    if (currentProject?.id === id) setCurrentProject(null);
  }

  async function selectDoc(id: string) {
    if (id === doc.id) return;
    await saveDoc({ ...doc, updatedAt: Date.now() });
    const d = await loadDocById(id);
    if (d) {
      setDoc(d);
      setSavedAt(d.updatedAt || null);
    }
  }

  async function newDoc() {
    await saveDoc({ ...doc, updatedAt: Date.now() });
    const created = await createDoc({ title: "無題", content: "" });
    setDocs((xs) => [{ id: created.id, title: created.title, updatedAt: created.updatedAt, chars: 0, sourcePath: null }, ...xs.filter((x) => x.id !== created.id)]);
    setDoc(created);
    setSavedAt(created.updatedAt);
  }

  async function importFile(file: File) {
    const text = await file.text();
    await saveDoc({ ...doc, updatedAt: Date.now() });
    const created = await createDoc({
      title: file.name.replace(/\.[^.]+$/, ""),
      content: text,
      sourcePath: file.name,
    });
    setDocs((xs) => [{ id: created.id, title: created.title, updatedAt: created.updatedAt, chars: text.length, sourcePath: created.sourcePath ?? null }, ...xs.filter((x) => x.id !== created.id)]);
    setDoc(created);
    setSavedAt(created.updatedAt);
  }

  function exportCurrent() {
    const blob = new Blob([doc.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (doc.title || "無題") + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function removeDoc(id: string) {
    await deleteDoc(id);
    setDocs((xs) => xs.filter((x) => x.id !== id));
    if (id === doc.id) {
      const fallback = await loadDocById("default");
      if (fallback) {
        setDoc(fallback);
        setSavedAt(fallback.updatedAt || null);
      }
    }
  }

  function renameDoc(id: string, title: string) {
    if (id === doc.id) {
      setDoc((d) => ({ ...d, title }));
    } else {
      (async () => {
        const d = await loadDocById(id);
        if (d) await saveDoc({ ...d, title });
        setDocs((xs) => xs.map((x) => (x.id === id ? { ...x, title } : x)));
      })();
    }
  }

  // ツールバー → ファイル / 編集 ハンドラ
  const toolbarHandlers = useMemo(
    () => ({
      newDoc: () => { void newDoc(); },
      openFile: () => importInputRef.current?.click(),
      exportFile: () => exportCurrent(),
      deleteDoc: () => {
        if (confirm(`「${doc.title || "無題"}」を削除しますか？`)) void removeDoc(doc.id);
      },
      undo: () => editorApi.current?.exec("undo"),
      redo: () => editorApi.current?.exec("redo"),
      cut: () => editorApi.current?.exec("cut"),
      copy: () => editorApi.current?.exec("copy"),
      paste: () => editorApi.current?.exec("paste"),
      selectAll: () => editorApi.current?.exec("selectAll"),
      openFind: () =>
        setSearch((s) => ({ ...s, open: true, opts: { ...s.opts, mode: "find" } })),
      openReplace: () =>
        setSearch((s) => ({ ...s, open: true, opts: { ...s.opts, mode: "replace" } })),
    }),
    [doc.id, doc.title]
  );

  // キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "f") {
        e.preventDefault();
        toolbarHandlers.openFind();
      } else if (k === "h") {
        e.preventDefault();
        toolbarHandlers.openReplace();
      } else if (k === "n") {
        e.preventDefault();
        toolbarHandlers.newDoc();
      } else if (k === "o") {
        e.preventDefault();
        toolbarHandlers.openFile();
      } else if (k === "e") {
        e.preventDefault();
        toolbarHandlers.exportFile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toolbarHandlers]);

  // 検索ヒットへジャンプ
  const handleSearchJump = useCallback((m: Match) => {
    setFlashRange({ start: m.start, end: m.end, token: Date.now() });
  }, []);
  const handleMatchesChange = useCallback((matches: Match[], current: number) => {
    setSearch((s) => ({ ...s, matches, current }));
  }, []);
  const handleReplaceOne = useCallback(
    (m: Match, repl: string) => {
      setDoc((d) => {
        const next = d.content.slice(0, m.start) + repl + d.content.slice(m.end);
        appendOp({
          id: newId(),
          documentId: d.id,
          ts: Date.now(),
          type: "replace",
          before: { start: m.start, end: m.end, text: d.content.slice(m.start, m.end) },
          after: { start: m.start, end: m.start + repl.length, text: repl },
          source: "user",
        });
        return { ...d, content: next, cursor: m.start + repl.length };
      });
      setFlashRange({ start: m.start, end: m.start + repl.length, token: Date.now() });
    },
    []
  );
  const handleReplaceAll = useCallback(
    (matches: Match[], compute: (m: Match) => string) => {
      if (matches.length === 0) return;
      setDoc((d) => {
        const sorted = [...matches].sort((a, b) => a.start - b.start);
        let out = "";
        let i = 0;
        let totalDelta = 0;
        for (const m of sorted) {
          out += d.content.slice(i, m.start);
          const r = compute(m);
          out += r;
          i = m.end;
          totalDelta += r.length - (m.end - m.start);
        }
        out += d.content.slice(i);
        appendOp({
          id: newId(),
          documentId: d.id,
          ts: Date.now(),
          type: "replace",
          before: { start: 0, end: d.content.length, text: "" },
          after: { start: 0, end: out.length, text: "" },
          source: "user",
        });
        return { ...d, content: out, cursor: Math.min(d.cursor + totalDelta, out.length) };
      });
    },
    []
  );

  // モバイル時はチャットを default で閉じる（ユーザー設定が無ければ）
  const effectiveChatOpen = isMobile ? chatOpen : true;

  return (
    <div className={"app" + (focusMode ? " focus" : "") + (isMobile ? " mobile" : "")}>
      <header className="app-head">
        <span className="app-logo-wrap" aria-hidden>
          <img src="/icon/icon.png" alt="" className="app-logo" />
        </span>
        <input
          className="app-filename"
          value={doc.title}
          onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
          placeholder="無題"
          spellCheck={false}
        />
        <div className="app-head-right">
          <label className="head-mode">
            <span>モード</span>
            <select
              value={profile.mode}
              onChange={(e) => setProfile((p) => ({ ...p, mode: e.target.value as Profile["mode"] }))}
            >
              <option value="draft">草稿</option>
              <option value="edit">編集</option>
            </select>
          </label>
          <button
            className={"focus-toggle " + (focusMode ? "on" : "")}
            onClick={() => setFocusMode((v) => !v)}
            title="集中モード (F8)"
          >
            {focusMode ? "通常表示" : "集中"}
          </button>
        </div>
      </header>
      <Toolbar
        handlers={toolbarHandlers}
        profile={profile}
        onChangeProfile={setProfile}
        aiStatus={aiStatus}
        onRecheckAI={recheckAI}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".txt,.md,.text,text/plain,text/markdown"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      <DocTabs
        docs={docs}
        activeId={doc.id}
        onSelect={selectDoc}
        onDelete={removeDoc}
        onRename={renameDoc}
      />
      <main className="app-main">
        <section className="pane editor-pane">
          <SearchPanel
            open={search.open}
            initial={search.opts}
            content={doc.content}
            onClose={() => setSearch((s) => ({ ...s, open: false }))}
            onMatchesChange={handleMatchesChange}
            onJump={handleSearchJump}
            onReplaceOne={handleReplaceOne}
            onReplaceAll={handleReplaceAll}
          />
          <Editor
            ref={editorApi}
            key={doc.id}
            value={doc.content}
            initialCursor={doc.cursor}
            initialScrollTop={doc.scrollTop}
            fontSize={profile.fontSize}
            lineHeight={profile.lineHeight}
            highlights={highlightsWithPending}
            flashRange={flashRange}
            rubyVisible={effSettings.rubyVisible}
            rubyReadings={effectiveReadings}
            onChange={handleEditorChange}
            onCursor={(cursor) => setDoc((d) => ({ ...d, cursor }))}
            onScroll={(scrollTop) => setDoc((d) => ({ ...d, scrollTop }))}
            onSelectionChange={setSelection}
          />
        </section>
        {effectiveChatOpen && (
          <aside className="pane side-pane">
            <div className="side-tabs">
              <button
                className={"side-tab " + (sideTab === "memo" ? "active" : "")}
                onClick={() => setSideTab("memo")}
                title="走り書きを改行ごとに本文へ反映"
              >
                下書きメモ
                {board.applied.length > 0 && <span className="side-tab-badge">{board.applied.length}</span>}
              </button>
              <button
                className={"side-tab " + (sideTab === "ai" ? "active" : "")}
                onClick={() => setSideTab("ai")}
                title="AIで生成・書き換え（選択していなくても使える）"
              >
                AI
                {selection && <span className="side-tab-badge">{selection.text.length}</span>}
              </button>
              <button
                className={"side-tab " + (sideTab === "ruby" ? "active" : "")}
                onClick={() => setSideTab("ruby")}
                title="ふりがな（ルビ）の自動／手動設定"
              >
                ふりがな
              </button>
              <button
                className={"side-tab " + (sideTab === "history" ? "active" : "")}
                onClick={() => setSideTab("history")}
                title="スナップショットと復元"
              >
                履歴
              </button>
              <button
                className={"side-tab " + (sideTab === "settings" ? "active" : "")}
                onClick={() => setSideTab("settings")}
                title="この原稿の設定・プロジェクト紐付け"
              >
                原稿
              </button>
            </div>
            {sideTab === "memo" ? (
              <div className="memo-tab-stack">
                <MemoNotebook
                  text={board.text}
                  applied={board.applied}
                  busy={memoBusy}
                  onChange={updateMemoText}
                  onCommitLine={(line) => {
                    // 草稿候補（助手草稿）は本文へ自動反映せず、別カードとして並走させる
                    if (profile.memoDraftEnabled) {
                      handleMemoDraft(line);
                      // 既存の本文反映系は呼ばない（手書き優先・自動執筆と競合させない）
                      return;
                    }
                    if (profile.memoSuggestEnabled && doc.content.trim().length > 0) {
                      void commitMemoLineAsSuggestion(line);
                    } else {
                      void commitMemoLine(line);
                    }
                  }}
                  onClickApplied={clickAppliedMark}
                  onCompileAll={compileMemos}
                  onSendToAI={() => sendMemoToAI(board.text)}
                  suggestMode={!!profile.memoSuggestEnabled && doc.content.trim().length > 0}
                />
                {profile.memoDraftEnabled && (
                  <MemoDraftPanel
                    drafts={memoDrafts}
                    onApply={applyMemoDraft}
                    onReject={rejectMemoDraft}
                    onRetry={retryMemoDraft}
                  />
                )}
              </div>
            ) : sideTab === "ai" ? (
              <RewritePanel
                adapter={adapter}
                selection={selection}
                pending={pending}
                sendKey={profile.aiSendKey || "enter"}
                onRun={runAIRewrite}
                onGenerate={runAIGenerate}
                onDiscard={discardPending}
                onCommitAll={commitAllPending}
                prefill={aiPrefill}
                onPrefillConsumed={() => setAiPrefill(null)}
              />
            ) : sideTab === "ruby" ? (
              <RubyPanel
                adapter={adapter}
                selection={selection}
                content={doc.content}
                autoReadings={furigana.readings.filter((r) => !r.manual)}
                manualReadings={manualOverrideReadings}
                reviewQueue={furigana.reviewQueue}
                furiganaStatus={furigana.status}
                onSetManual={applyManualRuby}
                onRemoveManual={removeManualRuby}
                onRefreshAuto={furigana.refresh}
              />
            ) : sideTab === "history" ? (
              <SnapshotsPanel
                docId={doc.id}
                onRestore={(content) => {
                  setDoc((d) => ({ ...d, content, cursor: 0, scrollTop: 0 }));
                }}
              />
            ) : (
              <SettingsPanel
                docId={doc.id}
                docTitle={doc.title}
                docSettings={doc.settings}
                projectId={doc.projectId}
                effective={effSettings}
                projects={projects}
                currentProject={currentProject}
                onChangeDocSettings={setDocSettings}
                onChangeProjectId={setDocProject}
                onCreateProject={createProj}
                onUpdateProject={updateProj}
                onDeleteProject={deleteProj}
                profile={profile}
                onChangeProfile={setProfile}
              />
            )}
          </aside>
        )}
        {isMobile && (
          <button
            className={"chat-fab" + (chatOpen ? " open" : "")}
            onClick={() => setChatOpen((v) => !v)}
            aria-label="チャットを開閉"
            title="チャットを開閉"
          >
            {chatOpen ? "×" : "AI"}
          </button>
        )}
      </main>
      <footer className="app-foot">
        <StatusBar
          paragraphChars={para.text.length}
          totalChars={doc.content.length}
          savedAt={savedAt}
          highlightsCount={highlights.length}
          profile={profile}
          onChange={setProfile}
          rubyStatus={
            effSettings.rubyVisible
              ? {
                  status: furigana.status,
                  error: furigana.error,
                  progress: furigana.progress,
                  readingsCount: effectiveReadings.length,
                }
              : undefined
          }
        />
      </footer>
    </div>
  );
}

