import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOARDS, ISLAND_LOOP, RENT_CAP, TURNS_EACH, newTable, reduceTable } from "./eight";
import {
  DECKS,
  HOUSE_RENT,
  HOUSE_SPOTS,
  LANDS,
  LAND_TAX,
  LISTINGS,
  MAX_PLAYERS,
  MAX_TICKET,
  MIN_TURNS,
  RECIPES,
  START_POINTS,
  build,
  buyLand,
  buyMaterial,
  canPlace,
  demolish,
  emptyRealm,
  hostReport,
  newWallet,
  parseRealm,
  parseWallet,
  rulesOf,
  setMinPlayers,
  setTicket,
  tableReward,
  turnsOf,
  type Wallet,
} from "./realm";

const rich = (): Wallet => ({ points: START_POINTS, stock: { wood: 99, stone: 99, gold: 99 } });
const guests = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `G${i}`, avatar: "", colour: "#000", bot: true }));

describe("領地: buying land", () => {
  it("starts with nothing: no land, no slots, nothing to build", () => {
    const realm = emptyRealm();
    assert.equal(realm.land, null);
    assert.deepEqual(realm.slots, []);
    assert.equal(canPlace(realm, "facade"), false);
  });

  it("buys the island for its price and gets its build slots", () => {
    const { realm, wallet } = buyLand(emptyRealm(), newWallet(), "island");
    assert.equal(realm.land, "island");
    assert.equal(realm.slots.length, LANDS.island.slots);
    assert.equal(wallet.points, START_POINTS - LANDS.island.price);
  });

  it("won't buy without the money, a second land, or a land that isn't ready yet", () => {
    const poor = { ...newWallet(), points: 10 };
    assert.equal(buyLand(emptyRealm(), poor, "island").realm.land, null);
    const owned = buyLand(emptyRealm(), newWallet(), "island");
    assert.equal(buyLand(owned.realm, owned.wallet, "island").wallet, owned.wallet);
    assert.equal(buyLand(emptyRealm(), { ...newWallet(), points: 9999 }, "volcano").realm.land, null);
  });
});

describe("領地: materials and building", () => {
  it("buildings cost materials, not money", () => {
    const { realm } = buyLand(emptyRealm(), newWallet(), "island");
    const wallet = rich();
    const built = build(realm, wallet, 0, "rent");
    assert.equal(built.realm.slots[0], "rent");
    assert.equal(built.wallet.points, wallet.points);
    assert.equal(built.wallet.stock.wood, 99 - RECIPES.rent.wood);
    assert.equal(built.wallet.stock.stone, 99 - RECIPES.rent.stone);
  });

  it("can't build without enough materials", () => {
    const { realm, wallet } = buyLand(emptyRealm(), newWallet(), "island");
    const tried = build(realm, wallet, 0, "rent");
    assert.equal(tried.realm, realm);
  });

  it("the shop turns points into materials (the points are gone)", () => {
    const wallet = buyMaterial(newWallet(), "stone", 2);
    assert.equal(wallet.stock.stone, 2);
    assert.ok(wallet.points < START_POINTS);
    const broke = { points: 1, stock: wallet.stock };
    assert.equal(buyMaterial(broke, "gold"), broke, "not enough points: nothing bought");
  });

  it("only one facade; demolishing frees the slot without a refund", () => {
    const { realm } = buyLand(emptyRealm(), newWallet(), "island");
    const first = build(realm, rich(), 0, "facade");
    assert.equal(canPlace(first.realm, "facade"), false);
    const down = demolish(first.realm, 0);
    assert.equal(down.slots[0], null);
  });

  it("stations shorten the game, not below the floor", () => {
    let state = { realm: buyLand(emptyRealm(), { ...rich(), points: 9999 }, "island").realm, wallet: rich() };
    state = build(state.realm, state.wallet, 0, "station");
    state = build(state.realm, state.wallet, 1, "station");
    assert.equal(turnsOf(state.realm), Math.max(MIN_TURNS, TURNS_EACH - 4));
  });

  it("the public table pays materials by place", () => {
    assert.ok(tableReward(0, 4).gold >= 1);
    assert.ok(tableReward(0, 4).wood > tableReward(3, 4).wood);
  });
});

describe("領地: tickets, players and 地稅", () => {
  it("tickets stay 0–20 and players 2–6", () => {
    assert.equal(setTicket(emptyRealm(), 99).ticket, MAX_TICKET);
    assert.equal(setMinPlayers(emptyRealm(), 9).minPlayers, MAX_PLAYERS);
    assert.equal(setMinPlayers(emptyRealm(), 0).minPlayers, 2);
  });

  it("takes 1.5% of the ticket money as 地稅", () => {
    const realm = setTicket(buyLand(emptyRealm(), newWallet(), "island").realm, 10);
    const report = hostReport(realm, 4, 3);
    assert.equal(LAND_TAX, 0.015);
    assert.equal(report.tickets, 40);
    assert.equal(report.tax, 0.6);
    assert.equal(report.net, 42.4);
  });

  it("every published deck pays out nothing on average", () => {
    for (const deck of Object.values(DECKS)) {
      assert.ok(deck.reduce((sum, card) => sum + (card.kind === "money" ? card.amount : 0), 0) <= 0);
    }
  });
});

describe("領地: playing on the island", () => {
  it("the island is a ring of 20 with a dock, and rent houses sit on its lots", () => {
    assert.equal(Object.keys(BOARDS.island.squares).length, ISLAND_LOOP);
    assert.equal(BOARDS.island.squares.o10.kind, "dock");
    for (const key of HOUSE_SPOTS.island) assert.equal(BOARDS.island.squares[key].kind, "lot");
  });

  it("guests pay the host's rent house, capped", () => {
    let { realm, wallet } = buyLand(emptyRealm(), rich(), "island");
    ({ realm, wallet } = build(realm, wallet, 0, "rent"));
    let state = newTable(guests(3), rulesOf(realm), "island");
    state = reduceTable(state, { type: "roll", dice: [1, 1] }); // start → o2, the first rent house
    assert.equal(state.hostIncome, Math.min(RENT_CAP, HOUSE_RENT));
  });

  it("seats six on a land, and a full game ends", () => {
    let state = newTable(guests(6), {}, "island");
    assert.equal(state.seats.length, 6);
    let guard = 0;
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (state.phase !== "over" && guard++ < 2000) {
      const d = () => 1 + Math.floor(r() * 6);
      state = reduceTable(state, state.phase === "fork" ? { type: "choose", road: false } : { type: "roll", dice: [d(), d()], card: Math.floor(r() * 99), fly: Math.floor(r() * 99) });
    }
    assert.equal(state.phase, "over");
  });

  it("the dock sails you to an empty lot", () => {
    let state = newTable(guests(2), {}, "island");
    state = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, spot: { on: "loop" as const, i: 8 } } : s)) };
    state = reduceTable(state, { type: "roll", dice: [1, 1], fly: 0 });
    assert.ok(state.events.some((e) => e.kind === "fly"));
  });
});

describe("領地: saving", () => {
  it("reads back a saved realm and wallet, and ignores junk", () => {
    const { realm } = buyLand(emptyRealm(), newWallet(), "island");
    const saved = setMinPlayers(setTicket(realm, 7), 4);
    assert.deepEqual(parseRealm(JSON.parse(JSON.stringify(saved))), saved);
    assert.deepEqual(parseRealm("nope"), emptyRealm());
    assert.deepEqual(parseWallet({ points: 12, stock: { wood: 3 } }), { points: 12, stock: { wood: 3, stone: 0, gold: 0 } });
  });

  it("the practice list only has lands that can be played", () => {
    for (const listing of LISTINGS) assert.ok(LANDS[listing.land].board);
  });
});
