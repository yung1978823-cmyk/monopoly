import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADS_PER_DAY, ODDS, PITY, adsLeft, draw, newCollection, rollRarity, watchAd } from "./shop";

describe("商店", () => {
  it("odds add up to 100% and pity gives an SSR", () => {
    assert.equal(Object.values(ODDS).reduce((a, b) => a + b, 0), 100);
    assert.equal(rollRarity(0.99, PITY - 1), "SSR");
    assert.equal(rollRarity(0.005, 0), "SSR");
    assert.equal(rollRarity(0.99, 0), "N");
  });
  it("a ten-draw always holds an SR or better", () => {
    const out = draw(newCollection(), "house", 10, () => 0.99);
    assert.ok(out.pulls.some((p) => p.rarity === "SR" || p.rarity === "SSR"));
    assert.equal(out.collection.sinceSSR.house, 10);
  });
  it("a duplicate character turns into shards", () => {
    const out = draw(newCollection(), "hero", 1, () => 0.2); // R → one of the four you already have
    assert.equal(out.pulls[0].duplicate, true);
    assert.equal(out.collection.shards, 5);
  });
  it("14 rewarded ads a day, then none until tomorrow", () => {
    let c = newCollection();
    for (let k = 0; k < ADS_PER_DAY; k++) c = watchAd(c, "2026-10-08")!;
    assert.equal(ADS_PER_DAY, 14);
    assert.equal(watchAd(c, "2026-10-08"), null);
    assert.equal(adsLeft(c, "2026-10-09"), ADS_PER_DAY);
  });
});
