// server/index.ts を CommonJS バンドルに変換して build/server.cjs に出力する。
// Electron の main からは fork('./build/server.cjs') で起動する。
// better-sqlite3 / kuromoji はネイティブ・大きい辞書を含むため external にして
// node_modules から実行時 require する。
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "build");
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "server/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: path.join(outDir, "server.cjs"),
  external: ["better-sqlite3", "kuromoji"],
  sourcemap: false,
  logLevel: "info",
  // CJS バンドル内で import.meta.url を __filename ベースに変換する。
  banner: {
    js: "const __import_meta_url = require('url').pathToFileURL(__filename).href;",
  },
  define: {
    "import.meta.url": "__import_meta_url",
  },
});

console.log("[build-server] done -> build/server.cjs");
