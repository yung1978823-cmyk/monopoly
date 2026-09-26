import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEVEL_COSTS,
  DICE_CAP,
  REFILL_MS,
  addTestDie,
  applyRefill,
  levelCost,
  formatClock,
  msUntilNextDie,
  spendDice,
} from "./rules";

describe("building levels", () => {
  it("cost more each level and stop after level 5", () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(levelCost), [...LEVEL_COSTS]);
    assert.equal(levelCost(5), null);
  });
});

describe("dice refill", () => {
  it("adds one die per 3 minutes and stops at 20", () => {
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

  it("starts a fresh 3 minutes when dice are spent from a full stack", () => {
    const spent = spendDice(20, 0, 50_000, 1);
    assert.deepEqual(spent, { dice: 19, lastRefillAt: 50_000 });
    const pair = spendDice(20, 0, 50_000, 2);
    assert.deepEqual(pair, { dice: 18, lastRefillAt: 50_000 });
    assert.equal(spendDice(1, 10, 50_000, 2), null);
    const kept = spendDice(4, 10, 50_000, 2);
    assert.deepEqual(kept, { dice: 2, lastRefillAt: 10 });
  });

  it("test die adds one without passing the cap", () => {
    assert.equal(addTestDie(0), 1);
    assert.equal(addTestDie(20), 20);
  });

  it("formats the countdown", () => {
    assert.equal(formatClock(REFILL_MS), "03:00");
    assert.equal(msUntilNextDie(20, 0, 0), null);
    assert.equal(msUntilNextDie(0, 0, 0), REFILL_MS);
  });
});
