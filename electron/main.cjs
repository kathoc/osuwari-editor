const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { fork } = require("node:child_process");

const isDev = !app.isPackaged;
const DEV_URL = process.env.OSUWARI_DEV_URL || "http://localhost:5173";

let serverProcess = null;
let serverPort = 0;
let mainWindow = null;

function startServer() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      // dev は npm run dev 側で server を起動している想定
      resolve(5174);
      return;
    }

    const serverEntry = path.join(__dirname, "..", "build", "server.cjs");
    const distDir = path.join(__dirname, "..", "dist");
    const dataDir = path.join(app.getPath("userData"), "data");
    fs.mkdirSync(dataDir, { recursive: true });

    const env = {
      ...process.env,
      OSUWARI_PORT: "0", // 任意の空きポート
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
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(targetUrl);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
