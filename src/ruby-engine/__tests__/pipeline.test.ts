import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RubyEngine } from "../index.js";
import { MockAnalyzer } from "../morphology/MockAnalyzer.js";
import { loadConfig } from "../dictionaries.js";

async function process(text: string) {
  const engine = new RubyEngine({
    analyzer: new MockAnalyzer(),
    config: loadConfig(),
  });
  return engine.processParagraph(text, { paragraphId: "t" });
}

function findSpan(spans: { base: string; ruby: string }[], base: string) {
  return spans.find((s) => s.base === base);
}

describe("pipeline (MockAnalyzer)", () => {
  it("今日の午後 → 今日=きょう (group)", async () => {
    const r = await process("今日の午後、村人ゾンビを観察した。");
    const today = r.rubySpans.find((s) => s.base === "今日");
    assert.ok(today, "expected 今日 span");
    assert.equal(today!.ruby, "きょう");
    assert.equal(today!.rubyMode, "group");
  });

  it("今日の社会 → 今日=こんにち (mono)", async () => {
    const r = await process("今日の社会では、AIの使い方が問われている。");
    const today = findSpan(r.rubySpans, "今日");
    assert.ok(today);
    assert.equal(today!.ruby, "こんにち");
  });

  it("人気がある → 人気=にんき", async () => {
    const r = await process("人気がある村を作ろう。");
    const ninki = findSpan(r.rubySpans, "人気");
    assert.ok(ninki);
    assert.equal(ninki!.ruby, "にんき");
  });

  it("人気のない洞窟 → 人気=ひとけ", async () => {
    const r = await process("人気のない洞窟に入る。");
    const span = findSpan(r.rubySpans, "人気");
    assert.ok(span);
    assert.equal(span!.ruby, "ひとけ");
  });

  it("生物を観察 → 生物=せいぶつ", async () => {
    const r = await process("生物を観察する。");
    const span = findSpan(r.rubySpans, "生物");
    assert.ok(span);
    assert.equal(span!.ruby, "せいぶつ");
  });

  it("生物が傷まない → 生物=なまもの", async () => {
    const r = await process("生物が傷まないように保存する。");
    const span = findSpan(r.rubySpans, "生物");
    assert.ok(span);
    assert.equal(span!.ruby, "なまもの");
  });

  it("一日中 → 一日=いちにち (mono)", async () => {
    const r = await process("一日中、マイクラで建築した。");
    const span = findSpan(r.rubySpans, "一日");
    assert.ok(span);
    assert.equal(span!.ruby, "いちにち");
    assert.equal(span!.rubyMode, "mono");
    assert.deepEqual(span!.segments?.map((s) => s.ruby), ["いち", "にち"]);
  });

  it("五月一日 → 一日=ついたち (group)", async () => {
    const r = await process("五月一日にイベントを開く。");
    const span = findSpan(r.rubySpans, "一日");
    assert.ok(span);
    assert.equal(span!.ruby, "ついたち");
    assert.equal(span!.rubyMode, "group");
  });

  it("日照センサー → 日照=にっしょう", async () => {
    const r = await process("日照センサーで街灯を自動化する。");
    const span = findSpan(r.rubySpans, "日照");
    assert.ok(span);
    assert.equal(span!.ruby, "にっしょう");
  });

  it("司書 → ししょ", async () => {
    const r = await process("司書の村人と取引する。");
    const span = findSpan(r.rubySpans, "司書");
    assert.ok(span);
    assert.equal(span!.ruby, "ししょ");
  });

  it("素早く確認 → 素早 と 確認 を別語として、送り仮名くを含めずルビ付け", async () => {
    const r = await process("素早く確認した。");
    const subayaku = r.rubySpans.find((s) => s.base === "素早");
    const kakunin = r.rubySpans.find((s) => s.base === "確認");
    assert.ok(subayaku, "素早 span should exist (okurigana stripped)");
    assert.equal(subayaku!.ruby, "すばや");
    assert.equal(subayaku!.end - subayaku!.start, 2, "span must cover only the kanji prefix");
    assert.ok(kakunin, "確認 span should exist");
    assert.equal(kakunin!.ruby, "かくにん");
    // there must NOT be a span that covers 素早く as one base
    assert.equal(r.rubySpans.find((s) => s.base === "素早く"), undefined);
  });

  it("食べる → base=食, ruby=た (送り仮名べる は本文側)", async () => {
    const r = await process("ごはんを食べる。");
    const taberu = r.rubySpans.find((s) => s.base === "食");
    assert.ok(taberu);
    assert.equal(taberu!.ruby, "た");
    assert.equal(taberu!.end - taberu!.start, 1);
  });

  it("成り立ち → 成 と 立 を別 span に分割（送り仮名は本文側に残す）", async () => {
    const r = await process("成り立ちを学ぶ。");
    const naru = r.rubySpans.find((s) => s.base === "成");
    const tatu = r.rubySpans.find((s) => s.base === "立");
    assert.ok(naru, "成 span should exist");
    assert.equal(naru!.ruby, "な");
    assert.equal(naru!.end - naru!.start, 1);
    assert.ok(tatu, "立 span should exist");
    assert.equal(tatu!.ruby, "た");
    assert.equal(tatu!.end - tatu!.start, 1);
    // 「成り立ち」全体が 1 span にならないこと
    assert.equal(r.rubySpans.find((s) => s.base === "成り立ち"), undefined);
  });

  it("欠かせない → 欠 のみが span（送り仮名 かせない は本文）", async () => {
    const r = await process("水は欠かせない。");
    const kaku = r.rubySpans.find((s) => s.base === "欠");
    assert.ok(kaku);
    assert.equal(kaku!.ruby, "か");
    assert.equal(kaku!.end - kaku!.start, 1);
  });

  it("電気 → 電/気 を mono 分割（segments で でん/き）", async () => {
    const r = await process("電気は便利だ。");
    const denki = r.rubySpans.find((s) => s.base === "電気");
    assert.ok(denki);
    assert.equal(denki!.ruby, "でんき");
    assert.equal(denki!.rubyMode, "mono");
    assert.deepEqual(denki!.segments?.map((s) => s.ruby), ["でん", "き"]);
  });

  it("paragraph cache returns same instance on repeated input", async () => {
    const engine = new RubyEngine({ analyzer: new MockAnalyzer(), config: loadConfig() });
    const a = await engine.processParagraph("一日中、マイクラで建築した。", { paragraphId: "p_0" });
    const b = await engine.processParagraph("一日中、マイクラで建築した。", { paragraphId: "p_0" });
    assert.strictEqual(a, b);
  });

  it("every result carries source, confidence, reason", async () => {
    const r = await process("司書の村人と取引する。");
    for (const s of r.rubySpans) {
      assert.ok(typeof s.source === "string");
      assert.ok(typeof s.confidence === "number");
      assert.ok(typeof s.reason === "string");
    }
  });
});
