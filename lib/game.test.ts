import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILES } from "./board";
import {
  STARTING_DICE,
  canBuild,
  countBuilt,
  createGame,
  nextBuildCost,
  parseSave,
  reduce,
  type Landmark,
} from "./game";
import { BUILD_COSTS, DICE_CAP, REFILL_MS } from "./rules";

const NOW = Date.parse("2026-09-24T08:00:00");
const DAY = "2026-09-24";

function start() {
  return createGame(NOW, DAY);
}

describe("daily board", () => {
  it("opens ready to roll with nothing built", () => {
    const state = start();
    assert.equal(state.dice, STARTING_DICE);
    assert.equal(state.points, 0);
    assert.equal(state.rollCount, 0);
    assert.equal(state.hasNft, true);
    assert.equal(state.rivalHasNft, true);
    assert.equal(state.dstTakenToday, 0);
    assert.deepEqual(state.landmarks, ["empty", "empty", "empty", "empty"]);
    assert.equal(countBuilt(state.rivalLandmarks), 2);
  });

  it("loads the walk board even when the save was a fight", () => {
    const fight = reduce(start(), { type: "move", face: 2, enemyDice: [1, 2], now: NOW });
    assert.equal(fight.phase, "search");
    const loaded = reduce(start(), { type: "hydrate", state: fight, now: NOW, dayKey: DAY });
    assert.equal(loaded.phase, "walk");
    assert.equal(loaded.position, fight.position);
  });

  it("keeps the dice count across a reload", () => {
    for (const dice of [0, 1, DICE_CAP]) {
      const saved = { ...start(), dice };
      const loaded = reduce(start(), { type: "hydrate", state: saved, now: NOW, dayKey: DAY });
      assert.equal(loaded.dice, dice);
    }
  });

  it("reads an older save with ruined landmarks and the old DST field", () => {
    const old = {
      ...start(),
      landmarks: ["built", "ruined", "empty", "empty"],
      dstTakenToday: undefined,
      rivalStolenToday: 3,
    };
    const loaded = parseSave(JSON.stringify({ v: 1, state: old }), NOW, DAY);
    assert.ok(loaded);
    assert.deepEqual(loaded.landmarks, ["built", "empty", "empty", "empty"]);
    assert.equal(loaded.dstTakenToday, 3);
  });

  it("opens 搜尋敵人 when the walk lands on 攻擊", () => {
    assert.equal(TILES.filter((tile) => tile.kind === "attack").length, 4);
    const state = reduce(start(), { type: "move", face: 2, enemyDice: [1, 2], now: NOW });
    assert.equal(state.position, 2);
    assert.equal(state.phase, "search");
    assert.equal(state.enemyLuck, 3);
    assert.deepEqual(state.lastRivalFaces, [1, 2]);
    assert.match(state.log[0]?.text ?? "", /搜尋敵人/);
  });

  it("does not walk while a fight is open", () => {
    const fight = reduce(start(), { type: "move", face: 2, enemyDice: [1, 2], now: NOW });
    assert.equal(reduce(fight, { type: "move", face: 1, now: NOW }), fight);
  });

  it("breaks the shield for 1 point and 0 DST, then pays DST only on a later hit", () => {
    let state = reduce(start(), { type: "move", face: 2, enemyDice: [1, 1], now: NOW });
    assert.equal(state.enemyShield, true);
    const missed = reduce(state, { type: "weapon" });
    assert.equal(missed.weaponReadout?.attackTotal, 10);
    assert.equal(missed.weaponReadout?.defenseTotal, 12);
    assert.equal(missed.weaponReadout?.hit, false);
    assert.equal(missed.weaponReadout?.pointsGained, 0);
    assert.equal(missed.enemyShield, true);
    assert.equal(missed.fightSettled, true);
    assert.equal(missed.points, state.points);

    state = {
      ...state,
      landmarks: ["built", "built", "built", "built"] as Landmark[],
      rivalLandmarks: ["built", "empty", "empty", "empty"] as Landmark[],
      enemyLuck: 2,
      enemyShield: true,
      fightSettled: false,
    };
    const shield = reduce(state, { type: "weapon" });
    assert.equal(shield.weaponReadout?.attackTotal, 30);
    assert.equal(shield.weaponReadout?.defenseTotal, 7);
    assert.equal(shield.weaponReadout?.shieldBreak, true);
    assert.equal(shield.weaponReadout?.pointsGained, 1);
    assert.equal(shield.weaponReadout?.dst, 0);
    assert.equal(shield.enemyShield, false);
    assert.equal(shield.fightSettled, false);

    const scored = reduce(shield, { type: "weapon" });
    assert.equal(scored.weaponReadout?.pointsGained, 5);
    assert.equal(scored.weaponReadout?.dst, 5);
    assert.equal(scored.dstTakenToday, 5);
    assert.equal(scored.fightSettled, true);
    assert.match(scored.log[0]?.text ?? "", /搬走 5 DST/);
    assert.equal(reduce(scored, { type: "weapon" }), scored);

    const noPlayer = reduce({ ...shield, hasNft: false }, { type: "weapon" });
    assert.equal(noPlayer.weaponReadout?.pointsGained, 5);
    assert.equal(noPlayer.weaponReadout?.dst, 0);
    const noRival = reduce({ ...shield, rivalHasNft: false }, { type: "weapon" });
    assert.equal(noRival.weaponReadout?.dst, 0);

    const room = reduce({ ...shield, dstTakenToday: 4 }, { type: "weapon" });
    assert.equal(room.weaponReadout?.dst, 1);
    const capped = reduce({ ...shield, dstTakenToday: 5 }, { type: "weapon" });
    assert.equal(capped.weaponReadout?.dst, 0);
    assert.equal(capped.weaponReadout?.pointsGained, 5);
  });

  it("spends points to raise landmarks, costing more each time", () => {
    const broke = start();
    assert.equal(canBuild(broke), false);
    assert.equal(reduce(broke, { type: "build" }), broke);

    let state = { ...start(), points: 100 };
    const total = BUILD_COSTS.reduce((sum, cost) => sum + cost, 0);
    for (const cost of BUILD_COSTS) {
      assert.equal(nextBuildCost(state), cost);
      const before = state.points;
      state = reduce(state, { type: "build" });
      assert.equal(state.points, before - cost);
    }
    assert.equal(countBuilt(state.landmarks), 4);
    assert.equal(state.points, 100 - total);
    assert.equal(nextBuildCost(state), null);
    assert.equal(reduce(state, { type: "build" }), state);
  });

  it("raises the landmark you stand on first", () => {
    const state = reduce({ ...start(), position: 9, points: 5 }, { type: "build" });
    assert.deepEqual(state.landmarks, ["empty", "empty", "built", "empty"]);
    assert.match(state.log[0]?.text ?? "", /花 5 分，起了南岸/);
  });

  it("walks one square per pip and spends a single die", () => {
    let state = { ...start(), dice: 0 };
    assert.equal(reduce(state, { type: "move", face: 1, now: NOW }), state);

    state = reduce({ ...state, dice: 1 }, { type: "move", face: 1, now: NOW });
    assert.equal(state.position, 1);
    assert.equal(state.points, 1);
    assert.equal(state.dice, 0);
    assert.equal(state.phase, "walk");
    assert.match(state.log[0]?.text ?? "", /走 1 格/);
  });

  it("pays the start bonus when the loop wraps", () => {
    const state = reduce({ ...start(), position: 10, dice: 1 }, { type: "move", face: 3, now: NOW });
    assert.equal(state.position, 1);
    assert.equal(state.points, 3);
  });

  it("refills a real die after 30 minutes", () => {
    const next = reduce({ ...start(), dice: 0 }, { type: "tick", now: NOW + REFILL_MS, dayKey: DAY });
    assert.equal(next.dice, 1);
    assert.match(next.log[0]?.text ?? "", /30 分鐘/);
  });

  it("resets the daily DST count on a new day", () => {
    const next = reduce({ ...start(), dstTakenToday: 4 }, { type: "tick", now: NOW, dayKey: "2026-09-25" });
    assert.equal(next.dstTakenToday, 0);
    assert.equal(next.dayKey, "2026-09-25");
  });
});
