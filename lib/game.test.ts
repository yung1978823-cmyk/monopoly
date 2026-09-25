import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILES } from "./board";
import { STARTING_DICE, countBuilt, createGame, reduce, rivalCanStrike, type Landmark } from "./game";
import { REFILL_MS } from "./rules";

const NOW = Date.parse("2026-09-24T08:00:00");
const DAY = "2026-09-24";

function start() {
  return createGame(NOW, DAY);
}

describe("daily board", () => {
  it("opens ready to roll, raise, and attack", () => {
    const state = start();
    assert.equal(state.dice, STARTING_DICE);
    assert.equal(state.points, 0);
    assert.equal(state.rollCount, 0);
    assert.equal(state.hasNft, true);
    assert.equal(state.postedPurse, 5);
    assert.deepEqual(state.landmarks, ["empty", "empty", "empty", "empty"]);
    assert.equal(countBuilt(state.landmarks), 0);
    assert.equal(countBuilt(state.rivalLandmarks), 2);
  });

  it("loads the walk board even when the save was a fight", () => {
    const fight = reduce(start(), {
      type: "move",
      face: 2,
      enemyDice: [1, 2],
      now: NOW,
    });
    assert.equal(fight.phase, "search");
    const loaded = reduce(start(), { type: "hydrate", state: fight, now: NOW, dayKey: DAY });
    assert.equal(loaded.phase, "walk");
    assert.equal(loaded.position, fight.position);
  });

  it("opens 搜尋敵人 when the walk lands on 攻擊", () => {
    assert.equal(TILES.filter((tile) => tile.kind === "attack").length, 4);
    const state = reduce(start(), {
      type: "move",
      face: 2,
      enemyDice: [1, 2],
      now: NOW,
    });
    assert.equal(state.position, 2);
    assert.equal(state.phase, "search");
    assert.equal(state.enemyLuck, 3);
    assert.deepEqual(state.lastRivalFaces, [1, 2]);
    assert.match(state.log[0]?.text ?? "", /搜尋敵人/);
    assert.match(state.log[0]?.text ?? "", /幸運值 3/);
  });

  it("hits only when the weapon is greater than the rival total", () => {
    let state = reduce(start(), {
      type: "move",
      face: 2,
      enemyDice: [1, 1],
      now: NOW,
    });
    const missed = reduce(state, { type: "weapon" });
    assert.equal(missed.weaponReadout?.weapon, 0);
    assert.equal(missed.weaponReadout?.rivalTotal, 4);
    assert.equal(missed.weaponReadout?.hit, false);
    assert.equal(missed.weaponReadout?.dst, 0);
    assert.equal(missed.rivalLandmarks[0], "built");

    state = {
      ...state,
      landmarks: ["built", "built", "built", "built"],
      rivalLandmarks: ["built", "empty", "empty", "empty"],
      enemyLuck: 2,
      lastRivalFaces: [1, 1],
    };
    const hit = reduce(state, { type: "weapon" });
    assert.equal(hit.weaponReadout?.weapon, 4);
    assert.equal(hit.weaponReadout?.rivalPower, 1);
    assert.equal(hit.weaponReadout?.rivalTotal, 3);
    assert.equal(hit.weaponReadout?.hit, true);
    assert.equal(hit.rivalLandmarks[0], "ruined");
    assert.equal(hit.weaponReadout?.dst, 0);
    assert.equal(hit.rivalStolenToday, state.rivalStolenToday);
    assert.equal(hit.points, state.points);
    assert.match(hit.log[0]?.text ?? "", /DST 不動/);

    const quiet = reduce({ ...state, hasNft: false }, { type: "weapon" });
    assert.equal(quiet.weaponReadout?.hit, true);
    assert.equal(quiet.weaponReadout?.dst, 0);
    assert.equal(quiet.rivalLandmarks[0], "ruined");
  });

  it("raises the first open landmark before any roll", () => {
    const state = reduce(start(), { type: "build" });
    assert.equal(state.landmarks[0], "built");
    assert.equal(state.points, 3);
    assert.equal(countBuilt(state.landmarks), 1);
  });

  it("walks one square per pip and spends a single die", () => {
    let state = { ...start(), dice: 0 };
    const short = reduce(state, { type: "move", face: 1, now: NOW });
    assert.equal(short, state);

    state = { ...state, dice: 1 };
    state = reduce(state, { type: "move", face: 1, now: NOW });
    assert.equal(state.position, 1);
    assert.equal(state.points, 1);
    assert.equal(state.dice, 0);
    assert.equal(state.phase, "walk");
    assert.equal(state.walkFace, 1);
    assert.match(state.log[0]?.text ?? "", /走 1 格/);
    state = reduce(state, { type: "build" });
    assert.equal(state.landmarks[0], "built");
    assert.equal(state.points, 4);
    assert.equal(countBuilt(state.landmarks), 1);
    assert.equal(state.pendingBuildIndex, null);
  });

  it("pays the start bonus when the loop wraps", () => {
    const state = reduce(
      { ...start(), position: 10, dice: 1 },
      { type: "move", face: 3, now: NOW },
    );
    assert.equal(state.position, 1);
    assert.equal(state.points, 3);
    assert.equal(state.dice, 0);
  });

  it("keeps DST at 0 without the NFT toggle, and still smashes for points", () => {
    let state = { ...start(), dice: 2, hasNft: false, postedPurse: 0 };
    state = reduce(state, { type: "attack", dice: [6, 6], target: 0, now: NOW });
    assert.equal(state.rivalStolenToday, 0);
    assert.equal(state.rivalLandmarks[0], "ruined");
    assert.equal(state.points, 2);
    assert.equal(state.rivalPoints, 1);
    assert.equal(state.dice, 0);
    assert.equal(state.lastStrike?.attackTotal, 12);
    assert.equal(state.lastStrike?.defense, 2);
    assert.equal(state.lastStrike?.dst, 0);
  });

  it("adds combat power to luck, then caps DST by the purse and the day", () => {
    let state = reduce(start(), { type: "set-nft", value: true });
    state = reduce(state, { type: "set-purse", value: 5 });
    state = {
      ...state,
      dice: 6,
      landmarks: ["empty", "empty", "empty", "empty"],
      rivalLandmarks: ["built", "built", "built", "built"],
    };

    state = reduce(state, { type: "attack", dice: [1, 1], target: 0, now: NOW });
    assert.equal(state.lastStrike?.luck, 2);
    assert.equal(state.lastStrike?.yourPower, 0);
    assert.equal(state.lastStrike?.rivalPower, 4);
    assert.equal(state.lastStrike?.attackTotal, 2);
    assert.equal(state.rivalStolenToday, 0);
    assert.equal(state.rivalLandmarks[0], "built");
    const below = state.log[0]?.text ?? "";
    assert.ok(below.indexOf("幸運值") < below.indexOf("你的戰鬥力"));
    assert.ok(below.indexOf("阿強的戰鬥力") < below.indexOf("DST"));

    state = reduce(state, { type: "attack", dice: [2, 2], target: 0, now: NOW });
    assert.equal(state.lastStrike?.attackTotal, 4);
    assert.equal(state.rivalStolenToday, 1);
    assert.equal(state.rivalLandmarks[0], "ruined");

    state = reduce(state, { type: "attack", dice: [6, 6], target: 1, now: NOW });
    assert.equal(state.rivalStolenToday, 5);
    assert.equal(state.rivalLandmarks[1], "ruined");
    assert.equal(state.dice, 0);

    state = { ...state, dice: 2 };
    const drained = reduce(state, { type: "attack", dice: [6, 6], target: 2, now: NOW });
    assert.equal(drained.rivalStolenToday, 5);
    assert.equal(drained.lastStrike?.dst, 0);
    assert.equal(drained.points, state.points + 2);
  });

  it("lets the rival roll two dice against your combat power", () => {
    let state = reduce(start(), { type: "set-nft", value: true });
    state = reduce(state, { type: "set-purse", value: 5 });
    state = {
      ...state,
      landmarks: ["built", "built", "built", "built"],
      rivalLandmarks: ["empty", "empty", "empty", "empty"],
    };
    const held = reduce(state, { type: "rival", dice: [1, 1], now: NOW });
    assert.deepEqual(held.landmarks, state.landmarks);
    assert.equal(held.playerStolenToday, 0);
    assert.equal(held.lastStrike?.attackTotal, 2);
    assert.equal(held.lastStrike?.defense, 4);
    assert.equal(held.rivalDice, 18);

    const broken = reduce(held, { type: "rival", dice: [2, 2], now: NOW });
    assert.equal(broken.landmarks[0], "ruined");
    assert.equal(broken.playerStolenToday, 1);
    assert.equal(broken.lastStrike?.attackTotal, 4);
    assert.equal(countBuilt(broken.landmarks), 3);
  });

  it("does not let the rival act when nothing can be smashed or taken", () => {
    const state = { ...start(), hasNft: false, postedPurse: 0 };
    assert.equal(rivalCanStrike(state), false);
    assert.equal(reduce(state, { type: "rival", dice: [6, 6], now: NOW }), state);
    const short = {
      ...start(),
      landmarks: ["built", "empty", "empty", "empty"] as Landmark[],
      rivalDice: 1,
    };
    assert.equal(rivalCanStrike(short), false);
  });

  it("refills a real die after 30 minutes", () => {
    const state = { ...start(), dice: 0 };
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
