import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CARDS,
  JAIL,
  LOOP,
  LOT_KEYS,
  MIDDLE,
  RENTS,
  SQUARES,
  STAKE,
  START_PAY,
  TURNS_EACH,
  UPGRADE_PRICE,
  botMove,
  keyOf,
  netWorth,
  newTable,
  nextSpot,
  reduceTable,
  standings,
  type Power,
  type Spot,
  type TableState,
} from "./eight";

const players = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ name: `P${index}`, avatar: "", colour: "#000", bot: index > 0 }));

const start = (count = 2): TableState => newTable(players(count));
const at = (state: TableState, seat: number, spot: Spot): TableState => ({
  ...state,
  seats: state.seats.map((player, index) => (index === seat ? { ...player, spot } : player)),
});
/** Squares the seat already owns at the top level: landing there does nothing, so a first die can stop safely. */
const quiet = (state: TableState, seat: number, ...keys: string[]): TableState => ({
  ...state,
  deeds: { ...state.deeds, ...Object.fromEntries(keys.map((key) => [key, { owner: seat, level: 4 }])) },
});
const cardIndex = (kind: string, amount?: number) =>
  CARDS.findIndex((card) => card.kind === kind && (amount === undefined || (card.kind === "money" && card.amount === amount)));

describe("八字 board", () => {
  it("has 31 loop squares and two inner roads of 3", () => {
    const keys = Object.keys(SQUARES);
    assert.equal(keys.filter((key) => key.startsWith("o")).length, 31);
    assert.equal(keys.filter((key) => key.startsWith("L") || key.startsWith("R")).length, 6);
    assert.equal(LOT_KEYS.length, 28);
  });

  it("passes the middle square twice a lap as the same square", () => {
    assert.equal(keyOf({ on: "loop", i: 24 }), keyOf({ on: "loop", i: MIDDLE }));
  });

  it("walks the loop, and an inner road rejoins the loop across the diamond", () => {
    assert.deepEqual(nextSpot({ on: "loop", i: LOOP - 1 }), { on: "loop", i: 0 });
    assert.deepEqual(nextSpot({ on: "loop", i: 30 }, true), { on: "L", k: 1 });
    assert.deepEqual(nextSpot({ on: "L", k: 3 }), { on: "loop", i: 6 });
    assert.deepEqual(nextSpot({ on: "loop", i: 14 }, true), { on: "R", k: 1 });
    assert.deepEqual(nextSpot({ on: "R", k: 3 }), { on: "loop", i: 22 });
    // Only forks turn off.
    assert.deepEqual(nextSpot({ on: "loop", i: 5 }, true), { on: "loop", i: 6 });
  });
});

describe("public table on the 八字 board", () => {
  it("seats everyone with the 18 stake", () => {
    assert.deepEqual(start(4).seats.map((seat) => seat.cash), [STAKE, STAKE, STAKE, STAKE]);
  });

  it("buys an empty lot on landing, then upgrades it on landing again", () => {
    // Each die walks on its own: the first stops on o1 (already ours), the second lands on o2.
    let state = reduceTable(quiet(start(), 0, "o1"), { type: "roll", dice: [1, 1] });
    assert.equal(state.deeds.o2?.owner, 0);
    assert.equal(state.seats[0].cash, STAKE - SQUARES.o2.price);
    assert.equal(state.current, 1);
    // Put seat 0 back one square before o2 and land again.
    state = at({ ...state, current: 0 }, 0, { on: "loop", i: 0 });
    state = reduceTable(state, { type: "roll", dice: [1, 1] });
    assert.equal(state.deeds.o2.level, 2);
    assert.equal(state.seats[0].cash, STAKE - SQUARES.o2.price - UPGRADE_PRICE);
  });

  it("won't buy or build unless 2 is left afterwards", () => {
    const poor = (cash: number) => ({ ...start(), seats: start().seats.map((seat, i) => (i === 0 ? { ...seat, cash } : seat)) });
    const skip = reduceTable(quiet(poor(SQUARES.o2.price + 1), 0, "o1"), { type: "roll", dice: [1, 1] });
    assert.equal(skip.deeds.o2, undefined, "would leave only 1");
    const buy = reduceTable(quiet(poor(SQUARES.o2.price + 2), 0, "o1"), { type: "roll", dice: [1, 1] });
    assert.equal(buy.deeds.o2?.owner, 0);
    assert.equal(buy.seats[0].cash, 2);
  });

  it("rent starts at 0.2 and money stays at one decimal place", () => {
    assert.deepEqual([...RENTS], [0, 0.2, 0.5, 1, 1.5]);
    let state = quiet({ ...start(), deeds: { o2: { owner: 1, level: 1 } } }, 0, "o1");
    for (let i = 0; i < 3; i += 1) state = reduceTable(at({ ...state, current: 0 }, 0, { on: "loop", i: 0 }), { type: "roll", dice: [1, 1] });
    assert.equal(state.seats[0].cash, 17.4, "three 0.2 rents, no floating-point crumbs");
    // Whole-number costs and prizes on top of a decimal balance stay tidy too (17.6 − 3 is not 14.600000000000001).
    let odd = { ...start(), seats: start().seats.map((seat, i) => (i === 0 ? { ...seat, cash: 17.6 } : seat)) };
    odd = reduceTable(quiet(odd, 0, "o1"), { type: "roll", dice: [1, 1] }); // buys o2 for 2
    assert.equal(odd.seats[0].cash, 15.6);
    let seed = 3;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let game = start(4);
    for (let i = 0; i < 400 && game.phase !== "over"; i += 1) {
      game = reduceTable(game, botMove(game, random));
      for (const seat of game.seats) assert.equal(seat.cash, Math.round(seat.cash * 10) / 10);
    }
  });

  it("charges rent by level, double on the gold roads", () => {
    let state = start();
    state = quiet({ ...state, deeds: { o2: { owner: 1, level: 3 }, L2: { owner: 1, level: 1 } } }, 0, "o1");
    const after = reduceTable(state, { type: "roll", dice: [1, 1] });
    assert.equal(after.seats[0].cash, STAKE - RENTS[3]);
    assert.equal(after.seats[1].cash, STAKE + RENTS[3]);
    const road = at({ ...state, deeds: { L2: { owner: 1, level: 1 } } }, 0, { on: "L", k: 1 });
    const paid = reduceTable(road, { type: "roll", dice: [1, 0 as unknown as number] });
    assert.equal(paid, road, "bad dice are ignored");
  });

  it("stops at a fork to ask, then goes the chosen way", () => {
    let state = at(start(), 0, { on: "loop", i: 28 });
    state = reduceTable(state, { type: "roll", dice: [2, 3] }); // 28 → 29 → 30 (fork), 3 left
    assert.equal(state.phase, "fork");
    assert.deepEqual(state.seats[0].spot, { on: "loop", i: 30 });
    assert.equal(state.stepsLeft, 3);
    const road = reduceTable(state, { type: "choose", road: true });
    assert.deepEqual(road.seats[0].spot, { on: "L", k: 3 });
    const loop = reduceTable(state, { type: "choose", road: false });
    assert.deepEqual(loop.seats[0].spot, { on: "loop", i: 1 });
    assert.equal(loop.seats[0].cash, STAKE + START_PAY - SQUARES.o1.price, "passing start pays, then buys");
  });

  it("gold road skips start and comes out past the bottom corner", () => {
    let state = quiet(at(start(), 0, { on: "loop", i: 30 }), 0, "L3");
    state = reduceTable(state, { type: "roll", dice: [3, 1] });
    state = reduceTable(state, { type: "choose", road: true });
    assert.deepEqual(state.seats[0].spot, { on: "loop", i: 6 });
    assert.equal(state.seats[0].cash, STAKE - SQUARES.o6.price);
  });

  it("chance cards pay, charge, move and jail; jail costs bail next turn", () => {
    const onChance = (card: number) => reduceTable(quiet(at(start(), 0, { on: "loop", i: 18 }), 0, "o19"), { type: "roll", dice: [1, 1], card });
    assert.equal(onChance(cardIndex("money", 2)).seats[0].cash, STAKE + 2);
    assert.equal(onChance(cardIndex("money", -2)).seats[0].cash, STAKE - 2);
    const moved = onChance(cardIndex("forward"));
    assert.deepEqual(moved.seats[0].spot, { on: "loop", i: 23 });
    const jailed = onChance(cardIndex("jail"));
    assert.deepEqual(jailed.seats[0].spot, { on: "loop", i: JAIL });
    assert.equal(jailed.seats[0].jailed, true);
    let back = { ...jailed, current: 0 };
    back = reduceTable(back, { type: "roll", dice: [1, 1] });
    assert.equal(back.seats[0].jailed, false);
    assert.ok(back.events.some((event) => event.kind === "freed"));
  });

  it("the plane flies to an empty lot and buys it", () => {
    const state = reduceTable(at(start(), 0, { on: "loop", i: 10 }), { type: "roll", dice: [1, 1], fly: 0 });
    const fly = state.events.find((event) => event.kind === "fly");
    assert.ok(fly && fly.kind === "fly");
    assert.equal(state.deeds[keyOf(fly.to)]?.owner, 0);
  });

  it("goes bankrupt when rent can't be paid, and the land returns to the bank", () => {
    let state = start();
    state = quiet({ ...state, deeds: { o2: { owner: 1, level: 4 }, o5: { owner: 0, level: 1 } } }, 0, "o1");
    state = { ...state, seats: state.seats.map((seat, index) => (index === 0 ? { ...seat, cash: 1 } : seat)) };
    const after = reduceTable(state, { type: "roll", dice: [1, 1] });
    assert.equal(after.seats[0].bankrupt, true);
    assert.equal(after.seats[1].cash, STAKE + 1);
    assert.equal(after.deeds.o5, undefined);
    assert.equal(after.phase, "over");
  });

  it("walks each die on its own, and the second die waits for the first to land", () => {
    const state = reduceTable(start(), { type: "roll", dice: [1, 2] });
    const kinds = state.events.map((event) => event.kind);
    const second = kinds.indexOf("second");
    assert.ok(second > 0, "a second throw happens");
    assert.ok(kinds.indexOf("bought") < second, "the first die's square is dealt with first");
    assert.equal(state.deeds.o1?.owner, 0);
    assert.equal(state.deeds.o3?.owner, 0);
    assert.equal(state.current, 1);
  });

  it("a first die that ends in jail or on a plane ends the turn", () => {
    const jailed = reduceTable(at(start(), 0, { on: "loop", i: 19 }), { type: "roll", dice: [1, 3], card: cardIndex("jail") });
    assert.ok(!jailed.events.some((event) => event.kind === "second"));
    assert.deepEqual(jailed.seats[0].spot, { on: "loop", i: JAIL });
    const flown = reduceTable(at(start(), 0, { on: "loop", i: 11 }), { type: "roll", dice: [1, 3], fly: 0 });
    assert.ok(flown.events.some((event) => event.kind === "fly"));
    assert.ok(!flown.events.some((event) => event.kind === "second"));
  });

  it("power cards: drawn at chance 3 times in 10, two at most, and each one works", () => {
    const onChance = (state: TableState, power: number) => reduceTable(quiet(at(state, 0, { on: "loop", i: 18 }), 0, "o19"), { type: "roll", dice: [1, 1], power });
    const got = onChance(start(), 10); // 10 % 10 = 0 → a card; 10 / 10 = 1 → POWERS[1]
    assert.deepEqual(got.seats[0].powers, ["lock"]);
    assert.ok(got.events.some((e) => e.kind === "power"));
    assert.deepEqual(onChance(start(), 9).seats[0].powers, [], "9 in 10 is an ordinary card");
    const full = { ...start(), seats: start().seats.map((s, i) => (i === 0 ? { ...s, powers: ["boost", "swap"] as Power[] } : s)) };
    assert.equal(onChance(full, 0).seats[0].powers.length, 2, "no room for a third");

    const withHand = (powers: Power[], deeds: TableState["deeds"]) => ({
      ...start(3),
      deeds,
      seats: start(3).seats.map((s, i) => (i === 0 ? { ...s, powers } : s)),
    });
    // 全城加建: every lot of yours up a level, landmarks stay.
    const boost = reduceTable(withHand(["boost"], { o1: { owner: 0, level: 1 }, o2: { owner: 0, level: 4 }, o3: { owner: 1, level: 1 } }), { type: "power", index: 0 });
    assert.deepEqual([boost.deeds.o1.level, boost.deeds.o2.level, boost.deeds.o3.level], [2, 4, 1]);
    assert.deepEqual(boost.seats[0].powers, []);
    // 拆樓: the opponent's best lot drops a level; a level-1 lot goes back to the bank.
    const wreck = reduceTable(withHand(["wreck"], { o5: { owner: 1, level: 3 }, o6: { owner: 2, level: 1 } }), { type: "power", index: 0 });
    assert.equal(wreck.deeds.o5.level, 2);
    const flatten = reduceTable(withHand(["wreck"], { o6: { owner: 2, level: 1 } }), { type: "power", index: 0 });
    assert.equal(flatten.deeds.o6, undefined);
    // 封地: no rent there for two rounds.
    let lock = reduceTable(withHand(["lock"], { o2: { owner: 1, level: 3 } }), { type: "power", index: 0 });
    assert.equal(lock.deeds.o2.locked, 6);
    lock = reduceTable(quiet(at(lock, 0, { on: "loop", i: 0 }), 0, "o1"), { type: "roll", dice: [1, 1] });
    assert.equal(lock.seats[0].cash, STAKE, "locked: no rent");
    assert.ok(lock.events.some((e) => e.kind === "lockedLot"));
    // 換位: trade places.
    const placed = at(at(withHand(["swap"], {}), 0, { on: "loop", i: 3 }), 2, { on: "loop", i: 9 });
    const swap = reduceTable(placed, { type: "power", index: 0, target: 2 });
    assert.deepEqual([swap.seats[0].spot, swap.seats[2].spot], [{ on: "loop", i: 9 }, { on: "loop", i: 3 }]);
    // 免租牌: can't be played, but lets the next rent off by itself.
    const shielded = withHand(["shield"], { o2: { owner: 1, level: 4 } });
    assert.equal(reduceTable(shielded, { type: "power", index: 0 }), shielded);
    const saved = reduceTable(quiet(shielded, 0, "o1"), { type: "roll", dice: [1, 1] });
    assert.equal(saved.seats[0].cash, STAKE);
    assert.deepEqual(saved.seats[0].powers, []);
    assert.ok(saved.events.some((e) => e.kind === "shielded"));
    // Only before rolling.
    const forked = { ...withHand(["boost"], { o1: { owner: 0, level: 1 } }), phase: "fork" as const };
    assert.equal(reduceTable(forked, { type: "power", index: 0 }), forked);
  });

  it("ends after 12 turns each and ranks by net worth", () => {
    let state = start(3);
    let guard = 0;
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (state.phase !== "over" && guard++ < 1000) state = reduceTable(state, botMove(state, random));
    assert.equal(state.phase, "over");
    // Either one player is left standing, or everyone still in has played every turn.
    const left = state.seats.filter((seat) => !seat.bankrupt);
    assert.ok(left.length === 1 || left.every((seat) => seat.turnsTaken === TURNS_EACH));
    const order = standings(state);
    for (let i = 1; i < order.length; i += 1) {
      if (!state.seats[order[i]].bankrupt) assert.ok(netWorth(state, order[i - 1]) >= netWorth(state, order[i]));
    }
  });
});
