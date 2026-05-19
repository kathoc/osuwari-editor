import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { RubyEngine } from "../src/ruby-engine/index.js";

const PORT = Number(process.env.OSUWARI_PORT || 5174);
const DATA_DIR = process.env.OSUWARI_DATA_DIR || path.resolve(process.cwd(), ".data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "osuwari.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '無題',
  content TEXT NOT NULL DEFAULT '',
  cursor INTEGER NOT NULL DEFAULT 0,
  scroll_top INTEGER NOT NULL DEFAULT 0,
  source_path TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS edit_ops (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_doc_ts ON edit_ops(document_id, ts);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '無題のプロジェクト',
  ruby_visible INTEGER NOT NULL DEFAULT 1,
  style_rule TEXT NOT NULL DEFAULT 'off',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_doc_ts ON snapshots(document_id, created_at DESC);
`);

// 旧スキーマ migrate: source_path / project_id / settings_json 列が無ければ追加
try {
  const cols = db.prepare("PRAGMA table_info(documents)").all() as any[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("source_path")) db.exec("ALTER TABLE documents ADD COLUMN source_path TEXT");
  if (!names.has("project_id")) db.exec("ALTER TABLE documents ADD COLUMN project_id TEXT");
  if (!names.has("settings_json")) db.exec("ALTER TABLE documents ADD COLUMN settings_json TEXT");
  if (!names.has("manual_ruby_json")) db.exec("ALTER TABLE documents ADD COLUMN manual_ruby_json TEXT");
} catch {}

const DEFAULT_DOC_ID = "default";
const DEFAULT_PROFILE_ID = "default";

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

// --- Document list -----------------------------------------------------------
app.get("/api/docs", (_req, res) => {
  ensureDefaultDoc();
  const rows = db
    .prepare(
      `SELECT id, title, LENGTH(content) AS chars, source_path AS sourcePath, project_id AS projectId, updated_at AS updatedAt
       FROM documents ORDER BY updated_at DESC`
    )
    .all() as any[];
  res.json(rows);
});

app.post("/api/docs", (req, res) => {
  const b = req.body ?? {};
  const id: string = typeof b.id === "string" && b.id ? b.id : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const now = Date.now();
  const projectId = typeof b.projectId === "string" ? b.projectId : null;
  const settings = b.settings && typeof b.settings === "object" ? JSON.stringify(b.settings) : null;
  const manualRuby = Array.isArray(b.manualRuby) ? JSON.stringify(b.manualRuby) : null;
  const doc = {
    id,
    title: typeof b.title === "string" ? b.title : "無題",
    content: typeof b.content === "string" ? b.content : "",
    cursor: Number.isFinite(b.cursor) ? b.cursor : 0,
    scrollTop: Number.isFinite(b.scrollTop) ? b.scrollTop : 0,
    sourcePath: typeof b.sourcePath === "string" ? b.sourcePath : null,
    projectId,
    settings: settings ? JSON.parse(settings) : null,
    manualRuby: manualRuby ? JSON.parse(manualRuby) : null,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO documents (id, title, content, cursor, scroll_top, source_path, project_id, settings_json, manual_ruby_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(doc.id, doc.title, doc.content, doc.cursor, doc.scrollTop, doc.sourcePath, projectId, settings, manualRuby, doc.updatedAt);
  res.json(doc);
});

app.get("/api/docs/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT id, title, content, cursor, scroll_top AS scrollTop, source_path AS sourcePath,
              project_id AS projectId, settings_json AS settingsJson, manual_ruby_json AS manualRubyJson, updated_at AS updatedAt
       FROM documents WHERE id = ?`
    )
    .get(req.params.id) as any | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  const { settingsJson, manualRubyJson, ...rest } = row;
  res.json({ ...rest, settings: safeParse(settingsJson), manualRuby: safeParse(manualRubyJson) });
});

app.put("/api/docs/:id", (req, res) => {
  const id = req.params.id;
  const { title, content, cursor, scrollTop, sourcePath, projectId, settings, manualRuby } = req.body ?? {};
  const now = Date.now();
  const settingsJson = settings && typeof settings === "object" ? JSON.stringify(settings) : null;
  const manualRubyJson = Array.isArray(manualRuby) ? JSON.stringify(manualRuby) : null;
  db.prepare(
    `INSERT INTO documents (id, title, content, cursor, scroll_top, source_path, project_id, settings_json, manual_ruby_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       cursor = excluded.cursor,
       scroll_top = excluded.scroll_top,
       source_path = excluded.source_path,
       project_id = excluded.project_id,
       settings_json = excluded.settings_json,
       manual_ruby_json = excluded.manual_ruby_json,
       updated_at = excluded.updated_at`
  ).run(
    id,
    typeof title === "string" ? title : "無題",
    typeof content === "string" ? content : "",
    Number.isFinite(cursor) ? cursor : 0,
    Number.isFinite(scrollTop) ? scrollTop : 0,
    typeof sourcePath === "string" ? sourcePath : null,
    typeof projectId === "string" ? projectId : null,
    settingsJson,
    manualRubyJson,
    now
  );
  res.json({ ok: true, updatedAt: now });
});

app.delete("/api/docs/:id", (req, res) => {
  const id = req.params.id;
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  db.prepare("DELETE FROM edit_ops WHERE document_id = ?").run(id);
  ensureDefaultDoc();
  res.json({ ok: true });
});

// 後方互換: 旧 /api/doc は default 原稿に対応
app.get("/api/doc", (_req, res) => {
  ensureDefaultDoc();
  const row = db
    .prepare(
      `SELECT id, title, content, cursor, scroll_top AS scrollTop, source_path AS sourcePath, updated_at AS updatedAt
       FROM documents WHERE id = ?`
    )
    .get(DEFAULT_DOC_ID);
  res.json(row);
});

app.put("/api/doc", (req, res) => {
  req.params = { ...(req.params || {}), id: DEFAULT_DOC_ID } as any;
  (app as any)._router.handle({ ...req, url: `/api/docs/${DEFAULT_DOC_ID}`, method: "PUT" }, res, () => {});
});

// --- Edit operations ---------------------------------------------------------
app.post("/api/ops", (req, res) => {
  const ops = Array.isArray(req.body) ? req.body : [req.body];
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO edit_ops (id, document_id, ts, type, before_json, after_json, source) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const tx = db.transaction((rows: any[]) => {
    for (const op of rows) {
      if (!op || typeof op.id !== "string") continue;
      stmt.run(
        op.id,
        op.documentId || DEFAULT_DOC_ID,
        Number(op.ts) || Date.now(),
        String(op.type || "replace"),
        JSON.stringify(op.before ?? {}),
        JSON.stringify(op.after ?? {}),
        String(op.source || "user")
      );
    }
  });
  tx(ops);
  res.json({ ok: true, count: ops.length });
});

app.get("/api/ops", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  const documentId = typeof req.query.documentId === "string" ? req.query.documentId : null;
  const rows = documentId
    ? db
        .prepare(
          "SELECT id, document_id AS documentId, ts, type, before_json AS beforeJson, after_json AS afterJson, source FROM edit_ops WHERE document_id = ? ORDER BY ts DESC LIMIT ?"
        )
        .all(documentId, limit)
    : db
        .prepare(
          "SELECT id, document_id AS documentId, ts, type, before_json AS beforeJson, after_json AS afterJson, source FROM edit_ops ORDER BY ts DESC LIMIT ?"
        )
        .all(limit);
  res.json(
    (rows as any[]).map((r) => ({
      id: r.id,
      documentId: r.documentId,
      ts: r.ts,
      type: r.type,
      before: safeParse(r.beforeJson),
      after: safeParse(r.afterJson),
      source: r.source,
    }))
  );
});

// --- Profile -----------------------------------------------------------------
app.get("/api/profile", (_req, res) => {
  const row = db.prepare("SELECT data_json AS dataJson FROM profiles WHERE id = ?").get(DEFAULT_PROFILE_ID) as
    | { dataJson: string }
    | undefined;
  res.json(row ? safeParse(row.dataJson) : null);
});

app.put("/api/profile", (req, res) => {
  const now = Date.now();
  db.prepare(
    `INSERT INTO profiles (id, data_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).run(DEFAULT_PROFILE_ID, JSON.stringify(req.body ?? {}), now);
  res.json({ ok: true, updatedAt: now });
});

// --- Projects ----------------------------------------------------------------
app.get("/api/projects", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.updated_at AS updatedAt,
              (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS docCount
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all();
  res.json(rows);
});

app.get("/api/projects/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT id, name, ruby_visible AS rubyVisibleInt, style_rule AS styleRule,
              created_at AS createdAt, updated_at AS updatedAt
       FROM projects WHERE id = ?`
    )
    .get(req.params.id) as any | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  const { rubyVisibleInt, ...rest } = row;
  res.json({ ...rest, rubyVisible: !!rubyVisibleInt });
});

app.post("/api/projects", (req, res) => {
  const b = req.body ?? {};
  const id: string = typeof b.id === "string" && b.id ? b.id : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const now = Date.now();
  const project = {
    id,
    name: typeof b.name === "string" ? b.name : "無題のプロジェクト",
    rubyVisible: b.rubyVisible === false ? 0 : 1,
    styleRule: typeof b.styleRule === "string" ? b.styleRule : "off",
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    "INSERT INTO projects (id, name, ruby_visible, style_rule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(project.id, project.name, project.rubyVisible, project.styleRule, project.createdAt, project.updatedAt);
  res.json({ ...project, rubyVisible: !!project.rubyVisible });
});

app.put("/api/projects/:id", (req, res) => {
  const id = req.params.id;
  const b = req.body ?? {};
  const cur = db
    .prepare("SELECT name, ruby_visible AS rubyVisible, style_rule AS styleRule FROM projects WHERE id = ?")
    .get(id) as any | undefined;
  if (!cur) return res.status(404).json({ error: "not found" });
  const next = {
    name: typeof b.name === "string" ? b.name : cur.name,
    rubyVisible: typeof b.rubyVisible === "boolean" ? (b.rubyVisible ? 1 : 0) : cur.rubyVisible,
    styleRule: typeof b.styleRule === "string" ? b.styleRule : cur.styleRule,
    updatedAt: Date.now(),
  };
  db.prepare(
    "UPDATE projects SET name = ?, ruby_visible = ?, style_rule = ?, updated_at = ? WHERE id = ?"
  ).run(next.name, next.rubyVisible, next.styleRule, next.updatedAt, id);
  res.json({ ok: true, updatedAt: next.updatedAt });
});

app.delete("/api/projects/:id", (req, res) => {
  const id = req.params.id;
  db.prepare("UPDATE documents SET project_id = NULL WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  res.json({ ok: true });
});

// --- Snapshots ---------------------------------------------------------------
app.get("/api/docs/:id/snapshots", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, document_id AS documentId, title, label, created_at AS createdAt, LENGTH(content) AS chars
       FROM snapshots WHERE document_id = ? ORDER BY created_at DESC LIMIT 200`
    )
    .all(req.params.id);
  res.json(rows);
});

app.post("/api/docs/:id/snapshots", (req, res) => {
  const id = req.params.id;
  const label = typeof req.body?.label === "string" ? req.body.label : "";
  const doc = db
    .prepare("SELECT title, content FROM documents WHERE id = ?")
    .get(id) as { title: string; content: string } | undefined;
  if (!doc) return res.status(404).json({ error: "doc not found" });
  const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const now = Date.now();
  db.prepare(
    `INSERT INTO snapshots (id, document_id, title, content, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sid, id, doc.title, doc.content, label, now);
  res.json({ id: sid, documentId: id, title: doc.title, label, createdAt: now, chars: doc.content.length });
});

app.get("/api/snapshots/:sid", (req, res) => {
  const row = db
    .prepare(
      `SELECT id, document_id AS documentId, title, content, label, created_at AS createdAt
       FROM snapshots WHERE id = ?`
    )
    .get(req.params.sid);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

app.delete("/api/snapshots/:sid", (req, res) => {
  db.prepare("DELETE FROM snapshots WHERE id = ?").run(req.params.sid);
  res.json({ ok: true });
});

// --- AI: Ollama proxy --------------------------------------------------------
// ブラウザから直接 Ollama(11434) を叩くと CORS で詰まるのでサーバ経由にする
app.post("/api/ai/ollama/generate", async (req, res) => {
  const body = req.body ?? {};
  const baseUrl = (typeof body.baseUrl === "string" && body.baseUrl) || "http://localhost:11434";
  const model = (typeof body.model === "string" && body.model) || "llama3.2";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt) return res.status(400).json({ error: "empty prompt" });
  try {
    const upstream = await fetch(baseUrl + "/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return res.status(502).json({ error: `ollama ${upstream.status}`, body: text });
    }
    const data: any = await upstream.json();
    res.json({ text: String(data.response || "") });
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

app.get("/api/ai/ollama/health", async (req, res) => {
  const baseUrl = (typeof req.query.baseUrl === "string" && req.query.baseUrl) || "http://localhost:11434";
  try {
    const r = await fetch(baseUrl + "/api/tags");
    if (!r.ok) return res.status(502).json({ ok: false, error: `ollama ${r.status}` });
    const data: any = await r.json();
    res.json({ ok: true, models: ((data?.models ?? []) as any[]).map((m) => m.name) });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

// --- Ruby Engine v2 ---------------------------------------------------------
const rubyEngine = new RubyEngine();

app.post("/api/ruby/analyze", async (req, res) => {
  const body = req.body ?? {};
  const raw = body.paragraphs;
  if (!Array.isArray(raw)) {
    return res.status(400).json({ error: "paragraphs[] required" });
  }
  if (body.noCache === true) rubyEngine.invalidateCache();
  try {
    const results = await Promise.all(
      raw.map((p: any, i: number) => {
        const text = typeof p?.text === "string" ? p.text : "";
        const id = typeof p?.id === "string" ? p.id : `p_${i}`;
        return rubyEngine.processParagraph(text, { paragraphId: id });
      }),
    );
    res.json({ results, engine: { name: "ruby-engine", version: "0.1.0" } });
  } catch (e: any) {
    console.error("[ruby-engine] analyze failed", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/ruby/cache/invalidate", (_req, res) => {
  rubyEngine.invalidateCache();
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true, db: DB_PATH }));

function ensureDefaultDoc() {
  const r = db.prepare("SELECT 1 FROM documents WHERE id = ?").get(DEFAULT_DOC_ID);
  if (!r) {
    const now = Date.now();
    db.prepare(
      "INSERT INTO documents (id, title, content, cursor, scroll_top, source_path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(DEFAULT_DOC_ID, "無題", "", 0, 0, null, now);
  }
}

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

// --- Static frontend (Electron 本番ビルド用) -------------------------------
// OSUWARI_STATIC_DIR が指定されていれば dist/ を配信する。
const STATIC_DIR = process.env.OSUWARI_STATIC_DIR || "";
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

const server = app.listen(PORT, () => {
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : PORT;
  console.log(`[osuwari-api] listening on http://localhost:${actualPort}  db=${DB_PATH}`);
  // Electron 親プロセスへ実ポートを通知
  if (process.send) process.send({ type: "listening", port: actualPort });
});
