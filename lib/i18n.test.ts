import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CARDS } from "./eight";
import { translate } from "./i18n";
import { CITIES } from "./cities";
import { DECKS } from "./realm";
import { LANDMARK_NAMES, TILE_INFO } from "./board";

/** Every literal passed to t(…) or say(…) in the screens. */
function screenTexts(): string[] {
  const dir = join(__dirname, "..", "components");
  const found = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(join(dir, file), "utf8");
    for (const match of source.matchAll(/\b(?:t|say)\(\s*"([^"]+)"/g)) found.add(match[1]);
    // Object-literal labels on the 領地 screen (building, size and deck names) are translated too.
    if (file === "realm-screen.tsx") for (const match of source.matchAll(/:\s*"([^"]+)"/g)) found.add(match[1]);
    for (const match of source.matchAll(/\bsay\([^;]*?\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)) {
      found.add(match[1]);
      found.add(match[2]);
    }
    for (const match of source.matchAll(/\bt\([^)]*?\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)) {
      found.add(match[1]);
      found.add(match[2]);
    }
  }
  return [...found].filter((text) => /[一-鿿]/.test(text));
}

describe("languages", () => {
  it("has Simplified and English for every piece of Chinese on screen", () => {
    const texts = [
      ...screenTexts(),
      ...CARDS.map((card) => card.text),
      ...Object.values(DECKS).flatMap((deck) => deck.map((card) => card.text)),
      ...CITIES.map((city) => city.rival.name),
      ...LANDMARK_NAMES,
      ...Object.values(TILE_INFO).map((tile) => tile.name),
      "你",
      "阿殭",
      "阿木",
      "阿強",
    ];
    const missing = texts.filter((text) => translate("en", text) === text || /[一-鿿]/.test(translate("en", text)));
    assert.deepEqual(missing, []);
  });

  it("fills in placeholders", () => {
    assert.equal(translate("en", "輪到 {name}", { name: "Mo" }), "Mo's turn");
    assert.equal(translate("hans", "擲出 {n}", { n: 7 }), "掷出 7");
    assert.equal(translate("hant", "擲出 {n}", { n: 7 }), "擲出 7");
  });
});
