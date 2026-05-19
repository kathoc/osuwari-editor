const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const https = require("node:https");
const { fork } = require("node:child_process");

const isDev = !app.isPackaged;
const DEV_URL = process.env.OSUWARI_DEV_URL || "http://localhost:5173";

// ローカルAI(オンデバイス)モデル設定
// 既定モデル: Llama-3.2-3B-Instruct Q4_K_M (約2.0GB)
// 日本語にもそこそこ対応する小型モデルとして採用。必要なら差し替え可。
const LOCAL_MODEL_ALIAS = "osuwari-local-llm.gguf";
const LOCAL_MODEL_URL =
  "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf";
const LOCAL_MODEL_EXPECTED_SIZE_BYTES = 2019377696; // 約2.0GB

let serverProcess = null;
let serverPort = 0;
let mainWindow = null;
let downloadController = null; // { req, abort, receivedAt0 }

function modelsDir() {
  return path.join(app.getPath("userData"), "models");
}
function modelPath() {
  return path.join(modelsDir(), LOCAL_MODEL_ALIAS);
}
function partialPath() {
  return modelPath() + ".part";
}

function startServer() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      resolve(5174);
      return;
    }
    const serverEntry = path.join(__dirname, "..", "build", "server.cjs");
    const distDir = path.join(__dirname, "..", "dist");
    const dataDir = path.join(app.getPath("userData"), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    const env = {
      ...process.env,
      OSUWARI_PORT: "0",
      OSUWARI_DATA_DIR: dataDir,
      OSUWARI_STATIC_DIR: distDir,
      NODE_ENV: "production",
    };
    serverProcess = fork(serverEntry, [], {
      env,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    serverProcess.on("message", (msg) => {
      if (msg && msg.type === "listening" && typeof msg.port === "number") {
        serverPort = msg.port;
        resolve(msg.port);
      }
    });
    serverProcess.on("error", reject);
    serverProcess.on("exit", (code) => {
      console.error(`[electron] server exited code=${code}`);
    });
  });
}

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("local-llm:download-progress", payload);
  }
}

function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function localLlmStatus() {
  const st = statSafe(modelPath());
  const installed = !!st && st.size > 0;
  return {
    installed,
    downloading: !!downloadController,
    sizeBytes: st ? st.size : 0,
    expectedSizeBytes: LOCAL_MODEL_EXPECTED_SIZE_BYTES,
    modelAlias: LOCAL_MODEL_ALIAS,
  };
}

function followRedirects(url, maxHops, onResponse, onError) {
  if (maxHops < 0) {
    onError(new Error("too many redirects"));
    return null;
  }
  const req = https.get(url, { headers: { "user-agent": "osuwari-editor" } }, (res) => {
    const code = res.statusCode || 0;
    if (code >= 300 && code < 400 && res.headers.location) {
      res.resume();
      followRedirects(res.headers.location, maxHops - 1, onResponse, onError);
      return;
    }
    if (code !== 200) {
      onError(new Error("HTTP " + code));
      res.resume();
      return;
    }
    onResponse(res);
  });
  req.on("error", onError);
  return req;
}

function startLocalLlmDownload() {
  if (downloadController) return { ok: false, reason: "already-downloading" };
  const dir = modelsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { ok: false, reason: "mkdir-failed", error: String(e) };
  }
  const out = fs.createWriteStream(partialPath());
  let received = 0;
  let total = LOCAL_MODEL_EXPECTED_SIZE_BYTES;
  let lastNotify = 0;
  let cancelled = false;

  const cleanupPartial = () => {
    try { fs.unlinkSync(partialPath()); } catch {}
  };

  const onError = (err) => {
    out.close();
    cleanupPartial();
    downloadController = null;
    sendProgress({ status: "error", received, total, error: String(err && err.message || err) });
  };

  const onResponse = (res) => {
    if (res.headers["content-length"]) {
      const n = Number(res.headers["content-length"]);
      if (Number.isFinite(n) && n > 0) total = n;
    }
    res.on("data", (chunk) => {
      received += chunk.length;
      const now = Date.now();
      if (now - lastNotify > 200) {
        lastNotify = now;
        sendProgress({ status: "downloading", received, total });
      }
    });
    res.pipe(out);
    res.on("error", onError);
    out.on("error", onError);
    out.on("finish", () => {
      if (cancelled) return;
      try {
        fs.renameSync(partialPath(), modelPath());
      } catch (e) {
        onError(e);
        return;
      }
      downloadController = null;
      sendProgress({ status: "done", received, total });
    });
  };

  const req = followRedirects(LOCAL_MODEL_URL, 5, onResponse, onError);
  if (!req) {
    cleanupPartial();
    return { ok: false, reason: "request-failed" };
  }
  downloadController = {
    abort: () => {
      cancelled = true;
      try { req.destroy(new Error("cancelled by user")); } catch {}
      try { out.close(); } catch {}
      cleanupPartial();
      downloadController = null;
      sendProgress({ status: "cancelled", received, total });
    },
  };
  sendProgress({ status: "downloading", received: 0, total });
  return { ok: true };
}

function cancelLocalLlmDownload() {
  if (!downloadController) return { ok: false, reason: "no-active" };
  downloadController.abort();
  return { ok: true };
}

function deleteLocalLlmModel() {
  if (downloadController) return { ok: false, reason: "downloading" };
  try {
    if (fs.existsSync(modelPath())) fs.unlinkSync(modelPath());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "unlink-failed", error: String(e) };
  }
}

function registerLocalLlmIpc() {
  ipcMain.handle("local-llm:status", () => localLlmStatus());
  ipcMain.handle("local-llm:download-start", () => startLocalLlmDownload());
  ipcMain.handle("local-llm:download-cancel", () => cancelLocalLlmDownload());
  ipcMain.handle("local-llm:delete", () => deleteLocalLlmModel());
  ipcMain.handle("local-llm:model-alias", () => LOCAL_MODEL_ALIAS);
}

async function loadLLM() {
  try {
    const { loadElectronLlm } = require("@electron/llm");
    await loadElectronLlm({
      getModelPath: (alias) => path.join(modelsDir(), alias),
    });
  } catch (e) {
    console.error("[electron] failed to load @electron/llm", e);
  }
}

async function createWindow() {
  const port = await startServer();
  const targetUrl = isDev ? DEV_URL : `http://localhost:${port}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    title: "Osuwari Editor",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(targetUrl);
}

app.whenReady().then(async () => {
  registerLocalLlmIpc();
  await loadLLM();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
