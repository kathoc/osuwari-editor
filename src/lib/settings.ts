import type { DocumentSettings, EffectiveSettings, Highlight, Project, StyleRule } from "./types";

export const DEFAULT_RUBY_VISIBLE = true;
export const DEFAULT_STYLE_RULE: StyleRule = "off";

export const STYLE_RULE_LABEL: Record<StyleRule, string> = {
  "off": "統一しない",
  "desu-masu": "です・ます調",
  "da-dearu": "だ・である調",
  "dayo-nanda": "だよ・なんだ調",
};

export function effectiveSettings(
  docSettings: DocumentSettings | null | undefined,
  project: Project | null | undefined
): EffectiveSettings {
  const rubyFromDoc = docSettings?.rubyVisible;
  const styleFromDoc = docSettings?.styleRule;
  let rubyVisible: boolean;
  let rubySrc: EffectiveSettings["source"]["rubyVisible"];
  if (rubyFromDoc !== undefined && rubyFromDoc !== null) {
    rubyVisible = !!rubyFromDoc;
    rubySrc = "doc";
  } else if (project) {
    rubyVisible = project.rubyVisible;
    rubySrc = "project";
  } else {
    rubyVisible = DEFAULT_RUBY_VISIBLE;
    rubySrc = "default";
  }
  let styleRule: StyleRule;
  let styleSrc: EffectiveSettings["source"]["styleRule"];
  if (styleFromDoc !== undefined && styleFromDoc !== null) {
    styleRule = styleFromDoc;
    styleSrc = "doc";
  } else if (project) {
    styleRule = project.styleRule;
    styleSrc = "project";
  } else {
    styleRule = DEFAULT_STYLE_RULE;
    styleSrc = "default";
  }
  return { rubyVisible, styleRule, source: { rubyVisible: rubySrc, styleRule: styleSrc } };
}

// 文体ルール違反のハイライトを返す
export function findStyleViolations(text: string, rule: StyleRule): Highlight[] {
  if (rule === "off") return [];
  // from: マッチした語幹（句点を除く形）／ to: 置換後の語幹
  type Pat = { re: RegExp; msg: string; from: string; to: string };
  const patterns: Pat[] = [];
  switch (rule) {
    case "desu-masu":
      patterns.push({ re: /(だ。|だ$|だ\n)/gm, msg: "「だ」→「です」に統一", from: "だ", to: "です" });
      patterns.push({ re: /(である。|である$|である\n)/gm, msg: "「である」→「です」に統一", from: "である", to: "です" });
      patterns.push({ re: /(だった。|だった$|だった\n)/gm, msg: "「だった」→「でした」に統一", from: "だった", to: "でした" });
      patterns.push({ re: /(なんだ。|なんだ$|なんだ\n)/gm, msg: "口語調が混在しています", from: "なんだ", to: "なのです" });
      patterns.push({ re: /(だよ。|だよ$|だよ\n)/gm, msg: "口語調が混在しています", from: "だよ", to: "です" });
      break;
    case "da-dearu":
      patterns.push({ re: /(です。|です$|です\n)/gm, msg: "「です」→「だ／である」に統一", from: "です", to: "である" });
      patterns.push({ re: /(ます。|ます$|ます\n)/gm, msg: "「ます」→「る」に統一", from: "ます", to: "る" });
      patterns.push({ re: /(でした。|でした$|でした\n)/gm, msg: "「でした」→「だった」に統一", from: "でした", to: "だった" });
      patterns.push({ re: /(ました。|ました$|ました\n)/gm, msg: "「ました」→「た」に統一", from: "ました", to: "た" });
      patterns.push({ re: /(なんだ。|なんだ$|なんだ\n)/gm, msg: "口語調が混在しています", from: "なんだ", to: "なのである" });
      patterns.push({ re: /(だよ。|だよ$|だよ\n)/gm, msg: "口語調が混在しています", from: "だよ", to: "である" });
      break;
    case "dayo-nanda":
      patterns.push({ re: /(です。|です$|です\n)/gm, msg: "「です」→「だよ」に統一", from: "です", to: "だよ" });
      patterns.push({ re: /(ます。|ます$|ます\n)/gm, msg: "「ます」→「だよ」に統一", from: "ます", to: "るんだよ" });
      patterns.push({ re: /(である。|である$|である\n)/gm, msg: "硬い文体が混在しています", from: "である", to: "なんだよ" });
      break;
  }
  const out: Highlight[] = [];
  for (const { re, msg, from, to } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      let end = m.index + m[0].length;
      const start = m.index;
      const matched = m[0];
      const trail = matched.endsWith("\n") ? 1 : 0;
      end -= trail;
      // 句読点込みの具体置換案
      const tail = matched.endsWith("。") ? "。" : "";
      out.push({
        start,
        end,
        kind: "style-rule",
        message: msg,
        suggestion: `「${from}${tail}」→「${to}${tail}」に書き換えましょう`,
      });
    }
  }
  return out;
}
