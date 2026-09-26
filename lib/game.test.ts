import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILES, TILE_POSITIONS } from "./board";
import {
  STARTING_DICE,
  attackPower,
  canBuild,
  countBuilt,
  createGame,
  holdsNft,
  nextBuildCost,
  nftCount,
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
    assert.deepEqual(state.nfts, [null, null, null, null, null]);
    assert.equal(state.rivalHasNft, true);
    assert.equal(state.dstTakenToday, 0);
    assert.deepEqual(state.landmarks, ["empty", "empty", "empty", "empty"]);
    assert.equal(countBuilt(state.rivalLandmarks), 2);
  });

  it("loads the walk board even when the save was a fight", () => {
    const fight = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 2], now: NOW });
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

  it("reads a save with a smashed landmark and the old DST field", () => {
    const old = {
      ...start(),
      landmarks: ["built", "ruined", "empty", "empty"],
      dstTakenToday: undefined,
      rivalStolenToday: 3,
    };
    const loaded = parseSave(JSON.stringify({ v: 1, state: old }), NOW, DAY);
    assert.ok(loaded);
    assert.deepEqual(loaded.landmarks, ["built", "ruined", "empty", "empty"]);
    assert.equal(loaded.dstTakenToday, 3);
  });

  it("opens 搜尋敵人 when the walk lands on 攻擊", () => {
    assert.equal(TILES.length, 28);
    assert.equal(TILES.filter((tile) => tile.kind === "attack").length, 7);
    const count = (kind: string) => TILES.filter((tile) => tile.kind === kind).length;
    assert.deepEqual(
      [count("start"), count("coin"), count("chest"), count("lucky"), count("jail"), count("tax")],
      [1, 12, 4, 2, 1, 1],
    );
    const state = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 2], now: NOW });
    assert.equal(state.position, 2);
    assert.equal(TILES[2]?.kind, "attack");
    assert.equal(state.phase, "search");
    assert.equal(state.enemyLuck, 3);
    assert.deepEqual(state.lastRivalFaces, [1, 2]);
    assert.match(state.log[0]?.text ?? "", /搜尋敵人/);
  });

  it("places the 28 squares on the board art, each a short even step from the last", () => {
    assert.equal(TILE_POSITIONS.length, TILES.length);
    const steps = TILE_POSITIONS.map((point, index) => {
      const next = TILE_POSITIONS[(index + 1) % TILE_POSITIONS.length];
      assert.ok(point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1);
      return Math.hypot(next.x - point.x, next.y - point.y);
    });
    for (const step of steps) assert.ok(step > 0.06 && step < 0.09, `step ${step}`);
  });

  it("lands on 攻擊 about one roll in four from any square", () => {
    for (let from = 0; from < TILES.length; from += 1) {
      let hits = 0;
      for (let a = 1; a <= 6; a += 1) {
        for (let b = 1; b <= 6; b += 1) {
          if (TILES[(from + a + b) % TILES.length]?.kind === "attack") hits += 1;
        }
      }
      assert.ok(hits >= 8 && hits <= 10, `square ${from}: ${hits}/36`);
    }
  });

  it("meets a rival with the given number of standing landmarks on each 攻擊 square", () => {
    const none = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalBuilt: 0, now: NOW });
    assert.deepEqual(none.rivalLandmarks, ["empty", "empty", "empty", "empty"]);
    const three = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalBuilt: 3, now: NOW });
    assert.deepEqual(three.rivalLandmarks, ["built", "built", "built", "empty"]);
    assert.match(three.log[0]?.text ?? "", /佢有 3 座建築/);
  });

  it("remembers which city the rival met on 攻擊 lives in", () => {
    const fight = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalCity: 2, now: NOW });
    assert.equal(fight.rivalCity, 2);
    const bad = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalCity: 9, now: NOW });
    assert.equal(bad.rivalCity, 0);
    const loaded = parseSave(JSON.stringify({ v: 1, state: fight }), NOW, DAY);
    assert.equal(loaded?.rivalCity, 2);
  });

  it("gives a rival no more landmarks than their city has plots", () => {
    const desert = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalBuilt: 4, rivalCity: 1, now: NOW });
    assert.deepEqual(desert.rivalLandmarks, ["built", "built", "empty", "empty"]);
    assert.match(desert.log[0]?.text ?? "", /佢有 2 座建築/);
    const town = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalBuilt: 4, rivalCity: 0, now: NOW });
    assert.equal(countBuilt(town.rivalLandmarks), 3);
  });

  it("gives a shield only to a rival holding an NFT", () => {
    const nft = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalBuilt: 2, now: NOW });
    assert.equal(nft.enemyShield, true);
    const plain = reduce(
      { ...start(), rivalHasNft: false },
      { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalBuilt: 2, now: NOW },
    );
    assert.equal(plain.enemyShield, false);
    // No shield: the first hit already needs a target and smashes it, for points only.
    const strong = { ...plain, landmarks: ["built", "built", "built", "built"] as Landmark[] };
    assert.equal(reduce(strong, { type: "weapon" }), strong);
    const hit = reduce(strong, { type: "weapon", target: 1 });
    assert.equal(hit.weaponReadout?.shieldBreak, false);
    assert.equal(hit.weaponReadout?.smashed, 1);
    assert.equal(hit.weaponReadout?.dst, 0);
    // Flipping the rival's NFT before the first strike brings the shield with it.
    assert.equal(reduce(plain, { type: "set-rival-nft", value: true }).enemyShield, true);
  });

  it("scores without smashing when the rival has nothing standing", () => {
    const fight = {
      ...reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], rivalBuilt: 0, now: NOW }),
      enemyShield: false,
    };
    const hit = reduce(fight, { type: "weapon" });
    assert.equal(hit.weaponReadout?.hit, true);
    assert.equal(hit.weaponReadout?.smashed, null);
  });

  it("does not smash on a miss", () => {
    const fight = {
      ...reduce(start(), { type: "move", faces: [1, 1], enemyDice: [6, 6], rivalBuilt: 4, now: NOW }),
      enemyShield: false,
    };
    const miss = reduce(fight, { type: "weapon", target: 2 });
    assert.equal(miss.weaponReadout?.hit, false);
    assert.equal(miss.weaponReadout?.smashed, null);
    assert.equal(miss.rivalLandmarks[2], "built");
  });

  it("repairs a smashed landmark for half price, before building a new one", () => {
    let state: ReturnType<typeof start> = {
      ...start(),
      points: 100,
      landmarks: ["built", "built", "built", "empty"] as Landmark[],
    };
    state = reduce(state, { type: "raided", target: 1 });
    assert.deepEqual(state.landmarks, ["built", "ruined", "built", "empty"]);
    assert.equal(state.points, 100, "being hit earns nothing");
    assert.match(state.log[0]?.text ?? "", /被打冇分/);
    assert.equal(nextBuildCost(state), 8, "half of the 15 a third landmark costs, rounded up");
    state = reduce(state, { type: "build" });
    assert.deepEqual(state.landmarks, ["built", "built", "built", "empty"]);
    assert.equal(state.points, 92);
    assert.match(state.log[0]?.text ?? "", /修好東市/);
    assert.equal(nextBuildCost(state), 20);
  });

  it("ignores a raid on a landmark that is not standing", () => {
    const state = start();
    assert.equal(reduce(state, { type: "raided", target: 0 }), state);
  });

  it("does not walk while a fight is open", () => {
    const fight = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 2], now: NOW });
    assert.equal(reduce(fight, { type: "move", faces: [1, 2], now: NOW }), fight);
  });

  it("settles a fight in one tap, breaking the shield on the way to the smash", () => {
    let state = reduce(start(), { type: "move", faces: [1, 1], enemyDice: [1, 1], now: NOW });
    assert.equal(state.enemyShield, true);
    assert.equal(reduce(state, { type: "weapon" }), state, "must pick a standing landmark");
    const missed = reduce(state, { type: "weapon", target: 0 });
    assert.equal(missed.weaponReadout?.attackTotal, 10);
    assert.equal(missed.weaponReadout?.defenseTotal, 12);
    assert.equal(missed.weaponReadout?.hit, false);
    assert.equal(missed.weaponReadout?.pointsGained, 0);
    assert.equal(missed.enemyShield, true);
    assert.equal(missed.fightSettled, true);
    assert.equal(missed.rivalLandmarks[0], "built");

    state = {
      ...state,
      landmarks: ["built", "built", "built", "built"] as Landmark[],
      nfts: ["nft-a", null, null, null, null],
      rivalLandmarks: ["built", "empty", "empty", "empty"] as Landmark[],
      enemyLuck: 2,
      enemyShield: true,
      fightSettled: false,
    };
    const scored = reduce(state, { type: "weapon", target: 0 });
    assert.equal(scored.weaponReadout?.attackTotal, 32, "10 + 4 buildings × 5 + 1 NFT × 2");
    assert.equal(scored.weaponReadout?.defenseTotal, 7);
    assert.equal(scored.weaponReadout?.shieldBreak, true);
    assert.equal(scored.weaponReadout?.pointsGained, 6, "1 for the shield and 5 for the smash");
    assert.equal(scored.weaponReadout?.dst, 5);
    assert.equal(scored.dstTakenToday, 5);
    assert.equal(scored.enemyShield, false);
    assert.equal(scored.fightSettled, true);
    assert.equal(scored.weaponReadout?.smashed, 0);
    assert.equal(scored.rivalLandmarks[0], "ruined");
    assert.match(scored.log[0]?.text ?? "", /搬走 5 DST/);
    assert.equal(reduce(scored, { type: "weapon", target: 0 }), scored);
    assert.ok(parseSave(JSON.stringify({ v: 1, state: scored }), NOW, DAY)?.weaponReadout);

    const noPlayer = reduce({ ...state, nfts: [null, null, null, null, null] }, { type: "weapon", target: 0 });
    assert.equal(noPlayer.weaponReadout?.pointsGained, 6);
    assert.equal(noPlayer.weaponReadout?.dst, 0);
    const noRival = reduce({ ...state, rivalHasNft: false, enemyShield: false }, { type: "weapon", target: 0 });
    assert.equal(noRival.weaponReadout?.dst, 0);
    assert.equal(noRival.weaponReadout?.pointsGained, 5);

    const room = reduce({ ...state, dstTakenToday: 4 }, { type: "weapon", target: 0 });
    assert.equal(room.weaponReadout?.dst, 1);
    const capped = reduce({ ...state, dstTakenToday: 5 }, { type: "weapon", target: 0 });
    assert.equal(capped.weaponReadout?.dst, 0);
  });

  it("fills up to five NFT slots; each adds attack and any one means you hold an NFT", () => {
    let state = start();
    assert.equal(holdsNft(state), false);
    assert.equal(attackPower(state), 10);
    state = reduce(state, { type: "place-nft", slot: 0, id: "vampire" });
    state = reduce(state, { type: "place-nft", slot: 3, id: "mummy" });
    assert.equal(holdsNft(state), true);
    assert.equal(nftCount(state), 2);
    assert.equal(attackPower(state), 14, "10 + 2 NFTs × 2");
    let full = state;
    for (const [slot, id] of [[1, "a"], [2, "b"], [4, "c"]] as const) full = reduce(full, { type: "place-nft", slot, id });
    assert.equal(attackPower(full), 20, "10 + 5 NFTs × 2");
    assert.equal(reduce(state, { type: "place-nft", slot: 0, id: "zombie" }), state, "slot taken");
    assert.equal(reduce(state, { type: "place-nft", slot: 1, id: "vampire" }), state, "same NFT twice");
    assert.equal(reduce(state, { type: "place-nft", slot: 5, id: "zombie" }), state, "only five slots");
    const loaded = parseSave(JSON.stringify({ v: 1, state }), NOW, DAY);
    assert.deepEqual(loaded?.nfts, ["vampire", null, null, "mummy", null]);
    state = reduce(reduce(state, { type: "remove-nft", slot: 0 }), { type: "remove-nft", slot: 3 });
    assert.equal(holdsNft(state), false);
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

  it("builds the first empty landmark wherever you stand", () => {
    const state = reduce({ ...start(), position: 17, points: 5 }, { type: "build" });
    assert.deepEqual(state.landmarks, ["built", "empty", "empty", "empty"]);
    assert.match(state.log[0]?.text ?? "", /花 5 分，起了北門/);
  });

  it("pays each square its reward and remembers the stop", () => {
    const at = (position: number, faces: [number, number], extra = {}) =>
      reduce({ ...start(), position, points: 10, dice: 5 }, { type: "move", faces, now: NOW, ...extra });
    const coin = at(0, [1, 2]);
    assert.equal(TILES[3]?.kind, "coin");
    assert.equal(coin.points, 12);
    assert.deepEqual(coin.landing, { kind: "coin", points: 2, dice: 0, passedStart: false });

    const chest = at(0, [2, 2], { chest: 6 });
    assert.equal(chest.points, 16);
    assert.equal(at(0, [2, 2], { chest: 99 }).points, 14, "a bad chest roll pays the default 4");

    const lucky = at(4, [2, 3]);
    assert.equal(TILES[9]?.kind, "lucky");
    assert.equal(lucky.dice, 5, "spends one die and wins it back");
    assert.equal(lucky.landing?.dice, 1);
  });

  it("keeps jail and tax mild and never below zero", () => {
    const jail = reduce({ ...start(), points: 10, dice: 1 }, { type: "move", faces: [3, 4], now: NOW });
    assert.equal(jail.position, 7);
    assert.equal(jail.points, 8);
    assert.equal(jail.dice, 0, "no extra dice lost");
    assert.equal(jail.phase, "walk");

    const tax = reduce({ ...start(), position: 15, points: 1, dice: 1 }, { type: "move", faces: [3, 3], now: NOW });
    assert.equal(tax.position, 21);
    assert.equal(tax.points, 0);
    assert.equal(tax.landing?.points, -1);
  });

  it("walks the sum of two dice and spends a single die", () => {
    let state = { ...start(), dice: 0 };
    assert.equal(reduce(state, { type: "move", faces: [1, 2], now: NOW }), state);

    state = reduce({ ...state, dice: 1 }, { type: "move", faces: [1, 2], now: NOW });
    assert.equal(state.position, 3);
    assert.equal(state.points, 2);
    assert.equal(state.dice, 0);
    assert.equal(state.phase, "walk");
    assert.deepEqual(state.walkFaces, [1, 2]);
    assert.match(state.log[0]?.text ?? "", /擲出 1 和 2。走 3 格/);
  });

  it("pays the start bonus when the loop wraps", () => {
    const state = reduce({ ...start(), position: 26, dice: 1 }, { type: "move", faces: [1, 2], now: NOW });
    assert.equal(state.position, 1);
    assert.equal(state.points, 4);
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
