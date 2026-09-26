import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RENT_CAP, TURNS_EACH, newTable, reduceTable, type TableState } from "./eight";
import {
  DECKS,
  HOUSE_RENT,
  HOUSE_SPOTS,
  MAX_TICKET,
  MIN_TURNS,
  SIZES,
  build,
  canBuild,
  demolish,
  hostReport,
  newRealm,
  parseRealm,
  resize,
  rulesOf,
  setTicket,
  tablesOf,
  turnsOf,
} from "./realm";

const guests = () =>
  ["A", "B", "C"].map((name) => ({ name, avatar: "", colour: "#000", bot: true }));

describe("領地", () => {
  it("sizes have the tables and build slots from the economy document", () => {
    assert.deepEqual(SIZES.small, { tables: 1, slots: 2 });
    assert.deepEqual(SIZES.medium, { tables: 3, slots: 4 });
    assert.deepEqual(SIZES.large, { tables: 6, slots: 6 });
    assert.equal(newRealm("large").slots.length, 6);
  });

  it("加枱 never goes past the size's table limit", () => {
    let realm = newRealm("small");
    assert.equal(canBuild(realm, "table"), false, "small already runs its 1 table");
    realm = newRealm("medium");
    realm = build(realm, 0, "table");
    realm = build(realm, 1, "table");
    assert.equal(tablesOf(realm), 3);
    assert.equal(canBuild(realm, "table"), false);
    assert.equal(build(realm, 2, "table"), realm);
  });

  it("stations shorten the game, but not below the floor", () => {
    let realm = newRealm("large");
    for (let slot = 0; slot < 6; slot += 1) realm = build(realm, slot, "station");
    assert.equal(turnsOf(realm), MIN_TURNS);
    assert.ok(turnsOf(realm) < TURNS_EACH);
  });

  it("tickets stay between 0 and the public entry of 20", () => {
    assert.equal(setTicket(newRealm(), 99).ticket, MAX_TICKET);
    assert.equal(setTicket(newRealm(), -3).ticket, 0);
  });

  it("every published deck pays out nothing on average", () => {
    for (const deck of Object.values(DECKS)) {
      const money = deck.reduce((sum, card) => sum + (card.kind === "money" ? card.amount : 0), 0);
      assert.ok(money <= 0);
    }
  });

  it("rent houses charge the host's rent, capped, and are never for sale", () => {
    const realm = build(newRealm(), 0, "rent");
    const rules = rulesOf(realm);
    assert.deepEqual(rules.houses, { [HOUSE_SPOTS[0]]: Math.min(RENT_CAP, HOUSE_RENT) });
    // Seat 0 walks from start onto o2 (the first rent house).
    let state: TableState = newTable(guests(), rules);
    state = reduceTable(state, { type: "roll", dice: [1, 1] });
    assert.equal(state.deeds.o2, undefined);
    assert.equal(state.hostIncome, HOUSE_RENT);
    assert.ok(state.events.some((event) => event.kind === "house"));
  });

  it("shrinking keeps what fits and demolishing frees the slot", () => {
    let realm = newRealm("large");
    realm = build(realm, 0, "facade");
    realm = build(realm, 1, "rent");
    realm = build(realm, 2, "station");
    const small = resize(realm, "small");
    assert.deepEqual(small.slots, ["facade", "rent"]);
    assert.deepEqual(demolish(small, 0).slots, [null, "rent"]);
  });

  it("works out the host's take", () => {
    const realm = setTicket(build(newRealm("medium"), 0, "table"), 10);
    const report = hostReport(realm, 3, 6);
    assert.equal(report.tickets, 30);
    assert.equal(report.cut, 3);
    assert.equal(report.net, 33);
    assert.equal(report.perRound, 66);
  });

  it("reads back a saved realm, and ignores junk", () => {
    const realm = setTicket(build(newRealm("medium"), 1, "chance"), 7);
    assert.deepEqual(parseRealm(JSON.parse(JSON.stringify({ ...realm, deck: "wild" }))), { ...realm, slots: ["chance", null, null, null], deck: "wild" });
    assert.deepEqual(parseRealm("nope"), newRealm());
  });
});
