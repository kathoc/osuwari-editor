import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findOkuriganaSplit, hasKanji, isKanji, katakanaToHiragana, normalizeReading, normalizeText } from "../normalize.js";

describe("normalize", () => {
  it("preserves offsets for unchanged text", () => {
    const n = normalizeText("今日の午後");
    assert.equal(n.text, "今日の午後");
    assert.equal(n.offsetMap.length, "今日の午後".length + 1);
    assert.equal(n.offsetMap[0], 0);
    assert.equal(n.offsetMap[5], 5);
  });

  it("NFKC normalizes full-width digits", () => {
    const n = normalizeText("ＡＢＣ１");
    assert.equal(n.text, "ABC1");
    assert.equal(n.offsetMap[0], 0);
  });

  it("katakanaToHiragana converts カナ to かな", () => {
    assert.equal(katakanaToHiragana("カナ"), "かな");
    assert.equal(katakanaToHiragana("センサー"), "せんさー");
  });

  it("normalizeReading converts ー to a writing vowel", () => {
    assert.equal(normalizeReading("エーガ"), "えいが");
    assert.equal(normalizeReading("コーヒー"), "こうひい");
  });

  it("findOkuriganaSplit", () => {
    assert.equal(findOkuriganaSplit("素早く"), 2);
    assert.equal(findOkuriganaSplit("食べる"), 1);
    assert.equal(findOkuriganaSplit("行く"), 1);
    assert.equal(findOkuriganaSplit("観察"), 0);
    assert.equal(findOkuriganaSplit("行き先"), 0); // kanji-kana-kanji is not a safe strip
    assert.equal(findOkuriganaSplit("きれい"), 0);
    assert.equal(findOkuriganaSplit(""), 0);
  });

  it("isKanji / hasKanji", () => {
    assert.equal(isKanji("今"), true);
    assert.equal(isKanji("あ"), false);
    assert.equal(hasKanji("今日"), true);
    assert.equal(hasKanji("きょう"), false);
  });
});
