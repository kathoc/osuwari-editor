import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { segmentRuby } from "../rubySegments.js";

const kanjiMap = {
  "一": ["いち", "いつ", "ひと"],
  "日": ["にち", "じつ", "ひ", "か"],
  "中": ["ちゅう", "じゅう", "なか"],
  "今": ["こん", "いま"],
  "村": ["そん", "むら"],
  "人": ["にん", "じん", "ひと"],
  "司": ["し"],
  "書": ["しょ"],
  "照": ["しょう", "て"],
  "生": ["せい", "しょう", "なま"],
  "物": ["ぶつ", "もつ", "もの"],
};
const jukujikun = { "今日": "きょう", "一日": "ついたち", "大人": "おとな" };

describe("segmentRuby", () => {
  it("splits 一日=いちにち into mono [いち, にち]", () => {
    const r = segmentRuby("一日", "いちにち", { kanjiReadingMap: kanjiMap, jukujikun });
    assert.equal(r.rubyMode, "mono");
    assert.deepEqual(r.segments?.map((s) => s.ruby), ["いち", "にち"]);
  });

  it("treats 一日=ついたち as group via jukujikun dict", () => {
    const r = segmentRuby("一日", "ついたち", { kanjiReadingMap: kanjiMap, jukujikun });
    assert.equal(r.rubyMode, "group");
  });

  it("treats 今日=きょう as group", () => {
    const r = segmentRuby("今日", "きょう", { kanjiReadingMap: kanjiMap, jukujikun });
    assert.equal(r.rubyMode, "group");
  });

  it("splits 今日=こんにち into mono [こん, にち]", () => {
    const r = segmentRuby("今日", "こんにち", { kanjiReadingMap: kanjiMap, jukujikun });
    assert.equal(r.rubyMode, "mono");
    assert.deepEqual(r.segments?.map((s) => s.ruby), ["こん", "にち"]);
  });

  it("splits 日照=にっしょう into mono [にっ, しょう] (sokuon)", () => {
    const r = segmentRuby("日照", "にっしょう", { kanjiReadingMap: kanjiMap, jukujikun });
    assert.equal(r.rubyMode, "mono");
    assert.deepEqual(r.segments?.map((s) => s.ruby), ["にっ", "しょう"]);
  });

  it("splits 村人=むらびと into mono [むら, びと] (rendaku)", () => {
    const r = segmentRuby("村人", "むらびと", { kanjiReadingMap: kanjiMap, jukujikun });
    assert.equal(r.rubyMode, "mono");
    assert.deepEqual(r.segments?.map((s) => s.ruby), ["むら", "びと"]);
  });

  it("splits 司書=ししょ into mono [し, しょ]", () => {
    const r = segmentRuby("司書", "ししょ", { kanjiReadingMap: kanjiMap, jukujikun });
    assert.equal(r.rubyMode, "mono");
    assert.deepEqual(r.segments?.map((s) => s.ruby), ["し", "しょ"]);
  });

  it("splits 生物=なまもの into mono [なま, もの]", () => {
    const r = segmentRuby("生物", "なまもの", { kanjiReadingMap: kanjiMap, jukujikun });
    assert.equal(r.rubyMode, "mono");
    assert.deepEqual(r.segments?.map((s) => s.ruby), ["なま", "もの"]);
  });
});
