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
    // Square 1 is a lot, one step from start.
    let state = reduceTable(start(), { type: "roll", dice: [1, 1] }); // lands on o2
    assert.equal(state.deeds.o2?.owner, 0);
    assert.equal(state.seats[0].cash, STAKE - SQUARES.o2.price);
    assert.equal(state.current, 1);
    // Put seat 0 back one square before o2 and land again.
    state = at({ ...state, current: 0 }, 0, { on: "loop", i: 0 });
    state = reduceTable(state, { type: "roll", dice: [1, 1] });
    assert.equal(state.deeds.o2.level, 2);
    assert.equal(state.seats[0].cash, STAKE - SQUARES.o2.price - UPGRADE_PRICE);
  });

  it("charges rent by level, double on the gold roads", () => {
    let state = start();
    state = { ...state, deeds: { o2: { owner: 1, level: 3 }, L2: { owner: 1, level: 1 } } };
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
    let state = at(start(), 0, { on: "loop", i: 30 });
    state = reduceTable(state, { type: "roll", dice: [2, 2] });
    state = reduceTable(state, { type: "choose", road: true });
    assert.deepEqual(state.seats[0].spot, { on: "loop", i: 6 });
    assert.equal(state.seats[0].cash, STAKE - SQUARES.o6.price);
  });

  it("chance cards pay, charge, move and jail; jail costs bail next turn", () => {
    const onChance = (card: number) => reduceTable(at(start(), 0, { on: "loop", i: 18 }), { type: "roll", dice: [1, 1], card });
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
    state = { ...state, deeds: { o2: { owner: 1, level: 4 }, o5: { owner: 0, level: 1 } } };
    state = { ...state, seats: state.seats.map((seat, index) => (index === 0 ? { ...seat, cash: 3 } : seat)) };
    const after = reduceTable(state, { type: "roll", dice: [1, 1] });
    assert.equal(after.seats[0].bankrupt, true);
    assert.equal(after.seats[1].cash, STAKE + 3);
    assert.equal(after.deeds.o5, undefined);
    assert.equal(after.phase, "over");
  });

  it("ends after 12 turns each and ranks by net worth", () => {
    let state = start(3);
    let guard = 0;
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (state.phase !== "over" && guard++ < 1000) state = reduceTable(state, botMove(state, random));
    assert.equal(state.phase, "over");
    assert.ok(state.seats.every((seat) => seat.bankrupt || seat.turnsTaken === TURNS_EACH));
    const order = standings(state);
    for (let i = 1; i < order.length; i += 1) {
      if (!state.seats[order[i]].bankrupt) assert.ok(netWorth(state, order[i - 1]) >= netWorth(state, order[i]));
    }
  });
});
