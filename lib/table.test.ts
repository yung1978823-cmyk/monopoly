import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CARDS,
  GO_TO_JAIL_SQUARE,
  JAIL_SQUARE,
  STAKE,
  TABLE_SQUARES,
  TURNS_EACH,
  botMove,
  buildable,
  lotsInGroup,
  netWorth,
  newTable,
  reduceTable,
  standings,
  type TableState,
} from "./table";

const players = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ name: `P${index}`, avatar: "", colour: "#000", bot: index > 0 }));

function start(count = 2): TableState {
  return newTable(players(count));
}

const cardIndex = (kind: string, amount?: number) =>
  CARDS.findIndex((card) => card.kind === kind && (amount === undefined || (card.kind === "money" && card.amount === amount)));

describe("public table", () => {
  it("seats everyone with the 18 left after the 20 entry and the house's 2", () => {
    const state = start(4);
    assert.equal(STAKE, 18);
    assert.deepEqual(state.seats.map((seat) => seat.cash), [18, 18, 18, 18]);
  });

  it("lays out 4 corners, 18 lots in 6 colours of 3, and 6 chance squares", () => {
    assert.equal(TABLE_SQUARES.length, 28);
    assert.equal(TABLE_SQUARES.filter((square) => square.kind === "lot").length, 18);
    assert.equal(TABLE_SQUARES.filter((square) => square.kind === "chance").length, 6);
    for (const group of ["brown", "sky", "pink", "orange", "red", "green"] as const) {
      assert.equal(lotsInGroup(group).length, 3, group);
    }
    assert.equal(TABLE_SQUARES[JAIL_SQUARE].kind, "jail");
    assert.equal(TABLE_SQUARES[GO_TO_JAIL_SQUARE].kind, "go-to-jail");
  });

  it("offers an unowned lot for 4, and charges rent 1 to the next visitor", () => {
    let state = reduceTable(start(), { type: "roll", dice: [1, 1] });
    assert.equal(state.seats[0].position, 2);
    assert.equal(state.phase, "buy");
    state = reduceTable(state, { type: "buy" });
    assert.equal(state.owners[2], 0);
    assert.equal(state.seats[0].cash, 14);
    state = reduceTable(state, { type: "end-turn" });
    assert.equal(state.current, 1);
    state = reduceTable(state, { type: "roll", dice: [1, 1] });
    assert.equal(state.seats[1].cash, 17);
    assert.equal(state.seats[0].cash, 15);
    assert.equal(state.phase, "act");
  });

  it("pays 1 for passing start", () => {
    let state = start();
    state = { ...state, seats: state.seats.map((seat, index) => (index === 0 ? { ...seat, position: 26 } : seat)) };
    state = reduceTable(state, { type: "roll", dice: [1, 3] });
    assert.equal(state.seats[0].position, 2);
    assert.equal(state.seats[0].cash, 19);
  });

  it("builds evenly on a full colour set, and rent climbs 1 → 2 → 3 → 4 → 6", () => {
    let state = start();
    const brown = lotsInGroup("brown");
    state = { ...state, owners: state.owners.map((owner, square) => (brown.includes(square) ? 0 : owner)), phase: "act" };
    state = { ...state, seats: state.seats.map((seat, index) => (index === 0 ? { ...seat, cash: 100 } : seat)) };
    assert.deepEqual(buildable(state, 0), brown);
    state = reduceTable(state, { type: "build", square: brown[0] });
    assert.deepEqual(buildable(state, 0), brown.slice(1), "must build the others up first");
    assert.equal(reduceTable(state, { type: "build", square: brown[0] }), state);
    for (let round = 0; round < 5; round += 1) {
      for (const lot of brown) state = reduceTable(state, { type: "build", square: lot });
    }
    assert.deepEqual(brown.map((lot) => state.buildings[lot]), [4, 4, 4], "hotels are the top");
    assert.equal(netWorth(state, 0), state.seats[0].cash + 3 * 4 + 3 * 4 * 2);
    assert.deepEqual(buildable({ ...state, owners: state.owners.map((o, s) => (s === brown[2] ? 1 : o)) }, 0), []);
  });

  it("sends a player to jail from the corner, and lets them out on doubles, bail, or after 3 turns", () => {
    let state = start();
    state = { ...state, seats: state.seats.map((seat, index) => (index === 0 ? { ...seat, position: 18 } : seat)) };
    state = reduceTable(state, { type: "roll", dice: [1, 2] });
    assert.equal(state.seats[0].position, JAIL_SQUARE);
    assert.equal(state.seats[0].jail, 1);
    state = reduceTable(reduceTable(state, { type: "end-turn" }), { type: "roll", dice: [1, 1] });
    state = reduceTable(state, { type: "skip" });
    state = reduceTable(state, { type: "end-turn" });
    assert.equal(state.current, 0);
    const stuck = reduceTable(state, { type: "roll", dice: [1, 2] });
    assert.equal(stuck.seats[0].jail, 2);
    assert.equal(stuck.current, 1, "a miss ends the turn");
    const bailed = reduceTable(state, { type: "bail" });
    assert.equal(bailed.seats[0].jail, 0);
    assert.equal(bailed.seats[0].cash, state.seats[0].cash - 1);
    const doubles = reduceTable(state, { type: "roll", dice: [3, 3] });
    assert.equal(doubles.seats[0].jail, 0);
    assert.equal(doubles.seats[0].position, JAIL_SQUARE + 6);
    const third = reduceTable({ ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, jail: 3 } : s)) }, { type: "roll", dice: [1, 2] });
    assert.equal(third.seats[0].jail, 0, "the third miss pays and walks out");
    assert.equal(third.seats[0].position, JAIL_SQUARE + 3);
  });

  it("draws chance cards", () => {
    const at = (card: number) => reduceTable(start(), { type: "roll", dice: [1, 2], card });
    assert.equal(TABLE_SQUARES[3].kind, "chance");
    assert.equal(at(cardIndex("money", 2)).seats[0].cash, 20);
    assert.equal(at(cardIndex("money", -2)).seats[0].cash, 16);
    assert.equal(at(cardIndex("jail")).seats[0].position, JAIL_SQUARE);
    const home = at(cardIndex("to-start"));
    assert.equal(home.seats[0].position, 0);
    assert.equal(home.seats[0].cash, 19, "passing start pays 1");
    const back = at(cardIndex("back"));
    assert.equal(back.seats[0].position, 0);
  });

  it("bankrupts a player who cannot pay, hands over their cash and frees their land", () => {
    let state = start();
    const lot = 2;
    state = {
      ...state,
      owners: state.owners.map((owner, square) => (square === lot ? 1 : square === 5 ? 0 : owner)),
      buildings: state.buildings.map((level, square) => (square === lot ? 4 : level)),
      seats: state.seats.map((seat, index) => (index === 0 ? { ...seat, cash: 3 } : seat)),
    };
    state = reduceTable(state, { type: "roll", dice: [1, 1] });
    assert.equal(state.seats[0].bankrupt, true);
    assert.equal(state.seats[1].cash, 21);
    assert.equal(state.owners[5], null);
    assert.equal(state.phase, "over", "one player left ends the game");
    assert.deepEqual(standings(state), [1, 0]);
  });

  it("ends after everyone has had 12 turns, richest first", () => {
    let state = start(3);
    let guard = 0;
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    while (state.phase !== "over" && guard < 1000) {
      state = reduceTable(state, botMove(state, random));
      guard += 1;
    }
    assert.equal(state.phase, "over");
    assert.ok(state.seats.every((seat) => seat.bankrupt || seat.turnsTaken === TURNS_EACH));
    const order = standings(state);
    const alive = order.filter((seat) => !state.seats[seat].bankrupt);
    for (let i = 1; i < alive.length; i += 1) {
      assert.ok(netWorth(state, alive[i - 1]) >= netWorth(state, alive[i]));
    }
  });
});
