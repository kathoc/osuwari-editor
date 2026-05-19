// Node/SQLite を一次ストレージ、localStorage はフォールバックとキャッシュ。
import type { DocumentState, DocumentSummary, EditOp, Profile, Project, ProjectSummary } from "./types";

const KEY_DOC_PREFIX = "osuwari.doc.v2:";
const KEY_DOCS_INDEX = "osuwari.docs.v2";
const KEY_OPS = "osuwari.ops.v1";
const KEY_PROFILE = "osuwari.profile.v1";
const OPS_MAX = 2000;
const API = "/api";

// --- Projects ----------------------------------------------------------------
export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const r = await fetch(`${API}/projects`);
    if (!r.ok) throw new Error();
    return (await r.json()) as ProjectSummary[];
  } catch {
    return [];
  }
}
export async function getProject(id: string): Promise<Project | null> {
  try {
    const r = await fetch(`${API}/projects/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    return (await r.json()) as Project;
  } catch {
    return null;
  }
}
export async function createProject(init: Partial<Project>): Promise<Project | null> {
  try {
    const r = await fetch(`${API}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(init),
    });
    if (!r.ok) return null;
    return (await r.json()) as Project;
  } catch {
    return null;
  }
}
export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  try {
    await fetch(`${API}/projects/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {}
}
export async function deleteProject(id: string): Promise<void> {
  try {
    await fetch(`${API}/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {}
}

export function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- Document list -----------------------------------------------------------
export async function listDocs(): Promise<DocumentSummary[]> {
  try {
    const r = await fetch(`${API}/docs`);
    if (!r.ok) throw new Error(String(r.status));
    const arr = (await r.json()) as DocumentSummary[];
    try { localStorage.setItem(KEY_DOCS_INDEX, JSON.stringify(arr)); } catch {}
    return arr;
  } catch {
    try {
      const raw = localStorage.getItem(KEY_DOCS_INDEX);
      return raw ? (JSON.parse(raw) as DocumentSummary[]) : [];
    } catch {
      return [];
    }
  }
}

export async function loadDocById(id: string): Promise<DocumentState | null> {
  try {
    const r = await fetch(`${API}/docs/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as DocumentState;
    try { localStorage.setItem(KEY_DOC_PREFIX + id, JSON.stringify(d)); } catch {}
    return d;
  } catch {
    try {
      const raw = localStorage.getItem(KEY_DOC_PREFIX + id);
      return raw ? (JSON.parse(raw) as DocumentState) : null;
    } catch {
      return null;
    }
  }
}

export async function saveDoc(doc: DocumentState): Promise<void> {
  try { localStorage.setItem(KEY_DOC_PREFIX + doc.id, JSON.stringify(doc)); } catch {}
  try {
    await fetch(`${API}/docs/${encodeURIComponent(doc.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
  } catch {}
}

export async function createDoc(init: { title?: string; content?: string; sourcePath?: string | null }): Promise<DocumentState> {
  const draft: DocumentState = {
    id: newId(),
    title: init.title || "無題",
    content: init.content || "",
    updatedAt: Date.now(),
    cursor: 0,
    scrollTop: 0,
    sourcePath: init.sourcePath ?? null,
  };
  try {
    const r = await fetch(`${API}/docs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (r.ok) {
      const created = (await r.json()) as DocumentState;
      try { localStorage.setItem(KEY_DOC_PREFIX + created.id, JSON.stringify(created)); } catch {}
      return created;
    }
  } catch {}
  try { localStorage.setItem(KEY_DOC_PREFIX + draft.id, JSON.stringify(draft)); } catch {}
  return draft;
}

export async function deleteDoc(id: string): Promise<void> {
  try { localStorage.removeItem(KEY_DOC_PREFIX + id); } catch {}
  try {
    await fetch(`${API}/docs/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {}
}

// 旧API互換: 直近アクティブ原稿のロード（後方互換のためだけ残す）
export async function loadDoc(): Promise<DocumentState | null> {
  return loadDocById("default");
}

// --- Edit ops ----------------------------------------------------------------
let pendingOps: EditOp[] = [];
let flushTimer: number | null = null;

export function appendOp(op: EditOp): void {
  pendingOps.push(op);
  try {
    const raw = localStorage.getItem(KEY_OPS);
    const arr: EditOp[] = raw ? JSON.parse(raw) : [];
    arr.push(op);
    if (arr.length > OPS_MAX) arr.splice(0, arr.length - OPS_MAX);
    localStorage.setItem(KEY_OPS, JSON.stringify(arr));
  } catch {}
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(flushOps, 500);
}

async function flushOps() {
  flushTimer = null;
  if (pendingOps.length === 0) return;
  const batch = pendingOps;
  pendingOps = [];
  try {
    await fetch(`${API}/ops`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
  } catch {
    pendingOps = batch.concat(pendingOps);
    flushTimer = window.setTimeout(flushOps, 2000);
  }
}

export async function loadOps(documentId?: string): Promise<EditOp[]> {
  try {
    const q = documentId ? `?documentId=${encodeURIComponent(documentId)}&limit=500` : `?limit=500`;
    const r = await fetch(`${API}/ops${q}`);
    if (!r.ok) throw new Error();
    return (await r.json()) as EditOp[];
  } catch {
    try {
      const raw = localStorage.getItem(KEY_OPS);
      const all = raw ? (JSON.parse(raw) as EditOp[]) : [];
      return documentId ? all.filter((o) => (o.documentId ?? "default") === documentId) : all;
    } catch {
      return [];
    }
  }
}

// --- Profile -----------------------------------------------------------------
export async function loadProfile(): Promise<Profile | null> {
  try {
    const r = await fetch(`${API}/profile`);
    if (!r.ok) throw new Error();
    const p = await r.json();
    if (p) { try { localStorage.setItem(KEY_PROFILE, JSON.stringify(p)); } catch {} }
    return p as Profile | null;
  } catch {
    try {
      const raw = localStorage.getItem(KEY_PROFILE);
      return raw ? (JSON.parse(raw) as Profile) : null;
    } catch {
      return null;
    }
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  try { localStorage.setItem(KEY_PROFILE, JSON.stringify(p)); } catch {}
  try {
    await fetch(`${API}/profile`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(p),
    });
  } catch {}
}
