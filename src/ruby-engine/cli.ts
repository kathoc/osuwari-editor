#!/usr/bin/env node
import { RubyEngine } from "./index.js";
import { MockAnalyzer } from "./morphology/MockAnalyzer.js";
import { KuromojiAdapter } from "./morphology/KuromojiAdapter.js";

interface Args {
  text?: string;
  file?: string;
  analyzer: "kuromoji" | "mock";
  pretty: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { analyzer: "kuromoji", pretty: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--text":
        args.text = argv[++i];
        break;
      case "--file":
        args.file = argv[++i];
        break;
      case "--analyzer":
        args.analyzer = argv[++i] === "mock" ? "mock" : "kuromoji";
        break;
      case "--compact":
        args.pretty = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage: ruby-engine [options]
  --text "..."           Process the given inline text.
  --file <path>          Read text from a file (paragraphs separated by blank lines).
  --analyzer mock|kuromoji   Choose morphology analyzer (default: kuromoji).
  --compact              Emit minified JSON.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let raw: string;
  if (args.file) {
    const fs = await import("node:fs");
    raw = fs.readFileSync(args.file, "utf8");
  } else if (typeof args.text === "string") {
    raw = args.text;
  } else if (!process.stdin.isTTY) {
    raw = await readStdin();
  } else {
    printHelp();
    process.exit(1);
    return;
  }
  const paragraphs = raw.split(/\n\s*\n/).map((p) => p.replace(/\n$/, "")).filter((p) => p.length > 0);
  const analyzer = args.analyzer === "mock" ? new MockAnalyzer() : new KuromojiAdapter();
  const engine = new RubyEngine({ analyzer });
  const results = await engine.processParagraphs(paragraphs.length > 0 ? paragraphs : [raw]);
  process.stdout.write(JSON.stringify(results, null, args.pretty ? 2 : 0) + "\n");
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
