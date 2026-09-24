import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countBuilt, createGame, reduce, rivalCanStrike } from "./game";
import { REFILL_MS } from "./rules";

const NOW = Date.parse("2026-09-24T08:00:00");
const DAY = "2026-09-24";

function start() {
  return createGame(NOW, DAY);
}

describe("daily board", () => {
  it("starts empty: no dice, no points, four open landmarks", () => {
    const state = start();
    assert.equal(state.dice, 0);
    assert.equal(state.points, 0);
    assert.equal(state.rollCount, 0);
    assert.deepEqual(state.landmarks, ["empty", "empty", "empty", "empty"]);
    assert.equal(countBuilt(state.landmarks), 0);
    assert.equal(countBuilt(state.rivalLandmarks), 2);
    assert.equal(state.hasNft, false);
  });

  it("walks the loop, scores points, and offers a build", () => {
    let state = reduce(start(), { type: "add-test-die" });
    state = reduce(state, { type: "move", roll: 2, now: NOW });
    assert.equal(state.position, 2);
    assert.equal(state.points, 1);
    assert.equal(state.dice, 0);
    assert.equal(state.pendingBuildIndex, 0);
    state = reduce(state, { type: "build" });
    assert.equal(state.landmarks[0], "built");
    assert.equal(state.points, 4);
    assert.equal(countBuilt(state.landmarks), 1);
    assert.equal(state.pendingBuildIndex, null);
  });

  it("pays the start bonus when the loop wraps", () => {
    const state = reduce(
      { ...start(), position: 10, dice: 1 },
      { type: "move", roll: 3, now: NOW },
    );
    assert.equal(state.position, 1);
    assert.equal(state.points, 3);
  });

  it("keeps DST at 0 without the NFT toggle, and still smashes for points", () => {
    let state = { ...start(), dice: 1 };
    state = reduce(state, { type: "attack", roll: 6, target: 0, now: NOW });
    assert.equal(state.rivalStolenToday, 0);
    assert.equal(state.rivalLandmarks[0], "ruined");
    assert.equal(state.points, 2);
    assert.equal(state.rivalPoints, 1);
    assert.equal(state.dice, 0);
  });

  it("moves DST only between NFT purses, capped by the formula and the day", () => {
    let state = reduce(start(), { type: "set-nft", value: true });
    state = reduce(state, { type: "set-purse", value: 5 });
    state = { ...state, dice: 3, rivalDice: 3 };

    state = reduce(state, { type: "attack", roll: 1, target: 0, now: NOW });
    assert.equal(state.rivalStolenToday, 0);
    assert.equal(state.rivalLandmarks[0], "built");

    state = reduce(state, { type: "attack", roll: 2, target: 0, now: NOW });
    assert.equal(state.rivalStolenToday, 1);
    assert.equal(state.rivalLandmarks[0], "ruined");
    assert.equal(countBuilt(state.rivalLandmarks), 1);

    state = reduce(state, { type: "attack", roll: 6, target: 1, now: NOW });
    assert.equal(state.rivalStolenToday, 5);
    assert.equal(state.rivalLandmarks[1], "ruined");

    state = { ...state, dice: 1 };
    const drained = reduce(state, { type: "attack", roll: 6, target: null, now: NOW });
    assert.equal(drained.rivalStolenToday, 5);
    assert.equal(drained.points, state.points + 2);
  });

  it("lets the rival smash one of your landmarks and stop at your purse", () => {
    let state = reduce(start(), { type: "set-nft", value: true });
    state = reduce(state, { type: "set-purse", value: 5 });
    state = {
      ...state,
      landmarks: ["built", "built", "built", "built"],
      dice: 1,
    };
    const held = reduce(state, { type: "rival", roll: 3, now: NOW });
    assert.deepEqual(held.landmarks, state.landmarks);
    assert.equal(held.playerStolenToday, 0);
    assert.equal(held.rivalDice, 19);

    const broken = reduce(held, { type: "rival", roll: 4, now: NOW });
    assert.equal(broken.landmarks[0], "ruined");
    assert.equal(broken.playerStolenToday, 1);
    assert.equal(countBuilt(broken.landmarks), 3);
  });

  it("does not let the rival act when nothing can be smashed or taken", () => {
    const state = start();
    assert.equal(rivalCanStrike(state), false);
    assert.equal(reduce(state, { type: "rival", roll: 6, now: NOW }), state);
  });

  it("refills a real die after 30 minutes", () => {
    const state = start();
    const next = reduce(state, { type: "tick", now: NOW + REFILL_MS, dayKey: DAY });
    assert.equal(next.dice, 1);
    assert.match(next.log[0]?.text ?? "", /30 分鐘/);
  });

  it("resets the daily purse on a new day", () => {
    let state = reduce(start(), { type: "set-nft", value: true });
    state = reduce(state, { type: "set-purse", value: 5 });
    state = { ...state, playerStolenToday: 2, rivalStolenToday: 4 };
    const next = reduce(state, { type: "tick", now: NOW, dayKey: "2026-09-25" });
    assert.equal(next.postedPurse, 0);
    assert.equal(next.playerStolenToday, 0);
    assert.equal(next.rivalStolenToday, 0);
    assert.equal(next.dayKey, "2026-09-25");
  });
});
