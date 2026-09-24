import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DICE_CAP,
  REFILL_MS,
  addTestDie,
  applyRefill,
  dstTaken,
  formatClock,
  landmarkIsSmashed,
  msUntilNextDie,
  rawDst,
  spendDie,
} from "./rules";

describe("dst from the locked daily rules", () => {
  it("defense 4, roll 4 takes 1", () => {
    assert.equal(rawDst(4, 4), 1);
    assert.equal(dstTaken({ roll: 4, defense: 4, defenderHasNft: true, remainingPurse: 5, stolenToday: 0 }), 1);
  });

  it("defense 4, roll 3 takes 0", () => {
    assert.equal(rawDst(3, 4), 0);
    assert.equal(dstTaken({ roll: 3, defense: 4, defenderHasNft: true, remainingPurse: 5, stolenToday: 0 }), 0);
  });

  it("defense 0, roll 6 takes 5", () => {
    assert.equal(rawDst(6, 0), 5);
    assert.equal(dstTaken({ roll: 6, defense: 0, defenderHasNft: true, remainingPurse: 5, stolenToday: 0 }), 5);
  });

  it("above defense uses min(5, max(2, roll - defense + 1))", () => {
    assert.equal(rawDst(5, 4), 2);
    assert.equal(rawDst(6, 4), 3);
    assert.equal(rawDst(6, 2), 5);
    assert.equal(rawDst(1, 0), 2);
  });

  it("never exceeds the remaining purse or the daily 5", () => {
    assert.equal(dstTaken({ roll: 6, defense: 0, defenderHasNft: true, remainingPurse: 1, stolenToday: 0 }), 1);
    assert.equal(dstTaken({ roll: 6, defense: 0, defenderHasNft: true, remainingPurse: 5, stolenToday: 4 }), 1);
    assert.equal(dstTaken({ roll: 6, defense: 0, defenderHasNft: true, remainingPurse: 5, stolenToday: 5 }), 0);
    assert.equal(dstTaken({ roll: 4, defense: 4, defenderHasNft: true, remainingPurse: 0, stolenToday: 0 }), 0);
  });

  it("without an NFT purse, DST stays 0", () => {
    assert.equal(dstTaken({ roll: 6, defense: 0, defenderHasNft: false, remainingPurse: 5, stolenToday: 0 }), 0);
  });
});

describe("smashing a landmark", () => {
  it("smashes a built landmark only when the roll meets defense", () => {
    assert.equal(landmarkIsSmashed(4, 4, true), true);
    assert.equal(landmarkIsSmashed(3, 4, true), false);
    assert.equal(landmarkIsSmashed(6, 0, false), false);
    assert.equal(landmarkIsSmashed(6, 2, false), false);
  });
});

describe("dice refill", () => {
  it("adds one die per 30 minutes and stops at 20", () => {
    const start = 1_000;
    const one = applyRefill(0, start, start + REFILL_MS);
    assert.deepEqual(one, { dice: 1, lastRefillAt: start + REFILL_MS, gained: 1 });

    const three = applyRefill(0, start, start + REFILL_MS * 3 + 5_000);
    assert.equal(three.dice, 3);
    assert.equal(three.gained, 3);
    assert.equal(three.lastRefillAt, start + REFILL_MS * 3);

    const capped = applyRefill(19, start, start + REFILL_MS * 4);
    assert.equal(capped.dice, DICE_CAP);
    assert.equal(capped.gained, 1);
    assert.equal(capped.lastRefillAt, start + REFILL_MS * 4);
  });

  it("does not bank extra dice while the cap is full", () => {
    const full = applyRefill(20, 0, REFILL_MS * 5);
    assert.deepEqual(full, { dice: 20, lastRefillAt: 0, gained: 0 });
  });

  it("starts a fresh 30 minutes when a die is spent from a full stack", () => {
    const spent = spendDie(20, 0, 50_000);
    assert.deepEqual(spent, { dice: 19, lastRefillAt: 50_000 });
    const kept = spendDie(4, 10, 50_000);
    assert.deepEqual(kept, { dice: 3, lastRefillAt: 10 });
  });

  it("test die adds one without passing the cap", () => {
    assert.equal(addTestDie(0), 1);
    assert.equal(addTestDie(20), 20);
  });

  it("formats the countdown", () => {
    assert.equal(formatClock(REFILL_MS), "30:00");
    assert.equal(msUntilNextDie(20, 0, 0), null);
    assert.equal(msUntilNextDie(0, 0, 0), REFILL_MS);
  });
});
