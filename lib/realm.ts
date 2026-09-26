/**
 * 第三層 領地 (practice version).
 *
 * Decided with Sky (2026-09-27):
 *  - You start with nothing. Buy a piece of land first; only then can you build and open it.
 *  - Three kinds of land, each with its own new board: 海島, 山城, 火山.
 *  - Buildings are not bought with money alone: each needs materials (木材, 石磚, 金塊).
 *  - It is private land: 2–6 people play there; the owner sets the ticket (max 20) and the
 *    fewest players a game starts with. The company takes 1.5% of the ticket money as 地稅.
 *  - For now computer guests stand in for real players; a real wallet comes later, so money and
 *    materials sit behind a small "wallet" record that can be swapped for the chain.
 *
 * TEMPORARY numbers, marked 臨時 on screen: land prices, material shop prices, building recipes,
 * the rent a rent house charges and how much a station shortens a game.
 */
import { CARDS, RENT_CAP, TURNS_EACH, type BoardId, type Card, type TableRules } from "@/lib/eight";

// ---------- Land ----------

export type LandKind = "island" | "mountain" | "volcano";
export const LAND_KINDS: readonly LandKind[] = ["island", "mountain", "volcano"];
export const LANDS: Record<LandKind, { price: number; slots: number; squares: number; board: BoardId | null }> = {
  island: { price: 150, slots: 2, squares: 20, board: "island" },
  mountain: { price: 300, slots: 4, squares: 28, board: null },
  volcano: { price: 500, slots: 6, squares: 36, board: null },
};

/** 地稅: the company's share of the ticket money on private land. */
export const LAND_TAX = 0.015;
export const MAX_TICKET = 20;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

// ---------- Materials ----------

export type Material = "wood" | "stone" | "gold";
export const MATERIALS: readonly Material[] = ["wood", "stone", "gold"];
export type Stock = Record<Material, number>;
export const NO_STOCK: Stock = { wood: 0, stone: 0, gold: 0 };
/** TEMPORARY shop prices. Money spent in the shop is burned, it goes to nobody. */
export const MATERIAL_PRICE: Stock = { wood: 2, stone: 3, gold: 8 };

// ---------- Buildings ----------

export type BuildingKind = "facade" | "table" | "rent" | "station" | "chance";
export const BUILDING_KINDS: readonly BuildingKind[] = ["facade", "rent", "station", "chance", "table"];
/** TEMPORARY recipes. */
export const RECIPES: Record<BuildingKind, Stock> = {
  facade: { wood: 5, stone: 0, gold: 0 },
  rent: { wood: 3, stone: 3, gold: 0 },
  station: { wood: 2, stone: 5, gold: 1 },
  chance: { wood: 2, stone: 2, gold: 1 },
  table: { wood: 4, stone: 4, gold: 2 },
};
/** TEMPORARY: what a rent house charges (must stay at or below the public-table cap of 6). */
export const HOUSE_RENT = 3;
/** TEMPORARY: turns each player gets are cut by this much per station, down to the floor. */
export const STATION_TURNS = 2;
export const MIN_TURNS = 8;

/** Where rent houses go on each board, in the order they are built. */
export const HOUSE_SPOTS: Record<BoardId, readonly string[]> = {
  island: ["o2", "o12", "o7", "o17", "o1", "o11"],
  eight: ["o2", "o18", "o10", "o26", "o6", "o22"],
};

/** Published chance decks. Each one's money cards add up to zero, so none pays out on average. */
export type DeckId = "standard" | "wild" | "calm";
export const DECKS: Record<DeckId, readonly Card[]> = {
  standard: CARDS,
  wild: [
    { kind: "money", amount: 4, text: "中大獎 +4" },
    { kind: "money", amount: 2, text: "路邊執到錢 +2" },
    { kind: "money", amount: -2, text: "整屋頂 −2" },
    { kind: "money", amount: -4, text: "俾人呃咗 −4" },
    { kind: "forward", steps: 3, text: "向前行三格" },
    { kind: "jail", text: "俾人捉咗，入獄" },
  ],
  calm: [
    { kind: "money", amount: 1, text: "中小獎 +1" },
    { kind: "money", amount: 1, text: "賣舊嘢 +1" },
    { kind: "money", amount: -1, text: "跌咗錢 −1" },
    { kind: "money", amount: -1, text: "交電費 −1" },
    { kind: "forward", steps: 3, text: "向前行三格" },
    { kind: "forward", steps: 3, text: "向前行三格" },
  ],
};

// ---------- Your wallet (practice points now; the real wallet later) ----------

export type Wallet = { points: number; stock: Stock };
export const WALLET_KEY = "boolionaire-wallet-v1";
/** Practice money to start with, enough for the island and a few materials. */
export const START_POINTS = 300;

export function newWallet(): Wallet {
  return { points: START_POINTS, stock: { ...NO_STOCK } };
}

export function hasStock(stock: Stock, need: Stock): boolean {
  return MATERIALS.every((m) => stock[m] >= need[m]);
}

export function buyMaterial(wallet: Wallet, material: Material, amount = 1): Wallet {
  const cost = MATERIAL_PRICE[material] * amount;
  if (amount < 1 || wallet.points < cost) return wallet;
  return { points: wallet.points - cost, stock: { ...wallet.stock, [material]: wallet.stock[material] + amount } };
}

export function addStock(wallet: Wallet, gain: Partial<Stock>): Wallet {
  const stock = { ...wallet.stock };
  for (const m of MATERIALS) stock[m] += Math.max(0, Math.floor(gain[m] ?? 0));
  return { ...wallet, stock };
}

/** Materials for a public-table finish (1st place most). Private-land games give none. */
export function tableReward(place: number, players: number): Stock {
  if (place >= players - 1 && players > 1) return { wood: 1, stone: 0, gold: 0 };
  return [
    { wood: 4, stone: 3, gold: 1 },
    { wood: 3, stone: 2, gold: 0 },
    { wood: 2, stone: 1, gold: 0 },
  ][Math.min(place, 2)];
}

// ---------- Your realm ----------

export type Realm = {
  land: LandKind | null;
  /** One entry per build slot of the land. */
  slots: (BuildingKind | null)[];
  ticket: number;
  /** The fewest players a game starts with (2–6). */
  minPlayers: number;
  deck: DeckId;
};

export const REALM_KEY = "boolionaire-realm-v2";

export function emptyRealm(): Realm {
  return { land: null, slots: [], ticket: 10, minPlayers: 2, deck: "standard" };
}

export function buyLand(realm: Realm, wallet: Wallet, land: LandKind): { realm: Realm; wallet: Wallet } {
  const info = LANDS[land];
  if (realm.land !== null || !info.board || wallet.points < info.price) return { realm, wallet };
  return {
    realm: { ...realm, land, slots: Array.from({ length: info.slots }, () => null) },
    wallet: { ...wallet, points: wallet.points - info.price },
  };
}

export function count(realm: Realm, kind: BuildingKind): number {
  return realm.slots.filter((slot) => slot === kind).length;
}

export function boardOf(realm: Realm): BoardId {
  return (realm.land && LANDS[realm.land].board) || "island";
}

/** Tables you can run at once: 1, plus one per 加枱. */
export function tablesOf(realm: Realm): number {
  return 1 + count(realm, "table");
}

export function turnsOf(realm: Realm): number {
  return Math.max(MIN_TURNS, TURNS_EACH - STATION_TURNS * count(realm, "station"));
}

export function housesOf(realm: Realm): string[] {
  return HOUSE_SPOTS[boardOf(realm)].slice(0, count(realm, "rent"));
}

/** Whether another building of this kind fits: a free slot and the kind's own limit. */
export function canPlace(realm: Realm, kind: BuildingKind): boolean {
  if (!realm.land || !realm.slots.includes(null)) return false;
  if (kind === "rent") return count(realm, "rent") < HOUSE_SPOTS[boardOf(realm)].length;
  if (kind === "station") return turnsOf(realm) > MIN_TURNS;
  if (kind === "facade") return count(realm, "facade") === 0;
  return true;
}

/** Build in a slot, paying the recipe's materials from the wallet. */
export function build(realm: Realm, wallet: Wallet, slot: number, kind: BuildingKind): { realm: Realm; wallet: Wallet } {
  if (realm.slots[slot] !== null || !canPlace(realm, kind) || !hasStock(wallet.stock, RECIPES[kind])) return { realm, wallet };
  const stock = { ...wallet.stock };
  for (const m of MATERIALS) stock[m] -= RECIPES[kind][m];
  return {
    realm: { ...realm, slots: realm.slots.map((value, index) => (index === slot ? kind : value)) },
    wallet: { ...wallet, stock },
  };
}

/** Knock a building down. Materials are not given back. */
export function demolish(realm: Realm, slot: number): Realm {
  return { ...realm, slots: realm.slots.map((value, index) => (index === slot ? null : value)) };
}

export function setTicket(realm: Realm, ticket: number): Realm {
  return { ...realm, ticket: Math.max(0, Math.min(MAX_TICKET, Math.round(ticket))) };
}

export function setMinPlayers(realm: Realm, players: number): Realm {
  return { ...realm, minPlayers: Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(players))) };
}

/** The table rules a game on this land plays by. */
export function rulesOf(realm: Realm): Partial<TableRules> {
  return {
    turnsEach: turnsOf(realm),
    houses: Object.fromEntries(housesOf(realm).map((key) => [key, Math.min(RENT_CAP, HOUSE_RENT)])),
    cards: count(realm, "chance") > 0 ? DECKS[realm.deck] : CARDS,
  };
}

/** What one game paid: tickets in, 1.5% 地稅 to the company, rent houses on top. */
export function hostReport(realm: Realm, guests: number, houseRent: number) {
  const tickets = realm.ticket * guests;
  const tax = Math.round(tickets * LAND_TAX * 100) / 100;
  const net = Math.round((tickets - tax + houseRent) * 100) / 100;
  return { tickets, tax, houseRent, net, perRound: Math.round(net * tablesOf(realm) * 100) / 100, tables: tablesOf(realm) };
}

// ---------- Other people's land, for the 領地列表 (practice: computer owners) ----------

export type Listing = { id: string; owner: string; land: LandKind; realm: Realm };
export const LISTINGS: readonly Listing[] = [
  { id: "a", owner: "阿殭", land: "island", realm: { land: "island", slots: ["rent", "facade"], ticket: 8, minPlayers: 2, deck: "standard" } },
  { id: "b", owner: "阿木", land: "island", realm: { land: "island", slots: ["station", "chance"], ticket: 15, minPlayers: 4, deck: "wild" } },
  { id: "c", owner: "阿強", land: "island", realm: { land: "island", slots: ["rent", "rent"], ticket: 0, minPlayers: 3, deck: "standard" } },
];

// ---------- Saving ----------

export function parseRealm(value: unknown): Realm {
  if (!value || typeof value !== "object") return emptyRealm();
  const raw = value as Partial<Realm>;
  const land = raw.land && LAND_KINDS.includes(raw.land) && LANDS[raw.land].board ? raw.land : null;
  if (!land) return emptyRealm();
  const slots = Array.from({ length: LANDS[land].slots }, (_, index) => {
    const kind = Array.isArray(raw.slots) ? raw.slots[index] : null;
    return kind && BUILDING_KINDS.includes(kind) ? kind : null;
  });
  const deck: DeckId = raw.deck === "wild" || raw.deck === "calm" ? raw.deck : "standard";
  let realm: Realm = { land, slots, ticket: 10, minPlayers: 2, deck };
  realm = setTicket(realm, typeof raw.ticket === "number" ? raw.ticket : 10);
  return setMinPlayers(realm, typeof raw.minPlayers === "number" ? raw.minPlayers : 2);
}

export function parseWallet(value: unknown): Wallet {
  if (!value || typeof value !== "object") return newWallet();
  const raw = value as Partial<Wallet>;
  const stock = { ...NO_STOCK };
  for (const m of MATERIALS) {
    const n = raw.stock?.[m];
    stock[m] = typeof n === "number" && n >= 0 ? Math.floor(n) : 0;
  }
  const points = typeof raw.points === "number" && raw.points >= 0 ? Math.round(raw.points * 100) / 100 : START_POINTS;
  return { points, stock };
}
