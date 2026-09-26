/**
 * 第三層 領地 (practice version): your own copy of the 八字 board that you build up and open to
 * guests. Guests pay your ticket (0–20); the house keeps a cut and the rest is yours, plus the
 * rent your rent houses collect during the game.
 *
 * From the economy document (decided): three sizes with fixed tables and build slots, five kinds
 * of building, rent houses capped at the public-table cap of 6, tickets capped at the public
 * entry of 20, chance decks only from the published list with expected value not above zero.
 *
 * Not decided yet, so these are TEMPORARY placeholders, marked on screen: what each building
 * costs, the house's cut of tickets, the rent a rent house charges and how much faster a station
 * makes a game.
 */
import { CARDS, RENT_CAP, TURNS_EACH, type Card, type TableRules } from "@/lib/eight";

export type RealmSize = "small" | "medium" | "large";
export const SIZES: Record<RealmSize, { tables: number; slots: number }> = {
  small: { tables: 1, slots: 2 },
  medium: { tables: 3, slots: 4 },
  large: { tables: 6, slots: 6 },
};

export type BuildingKind = "facade" | "table" | "rent" | "station" | "chance";
export const BUILDING_KINDS: readonly BuildingKind[] = ["facade", "table", "rent", "station", "chance"];

/** TEMPORARY build costs (practice points; real prices in DST are not decided). */
export const BUILD_COST: Record<BuildingKind, number> = { facade: 2, table: 5, rent: 3, station: 4, chance: 3 };
/** TEMPORARY: the house's share of ticket money. */
export const TICKET_CUT = 0.1;
/** TEMPORARY: what a rent house charges (must stay at or below the cap). */
export const HOUSE_RENT = 3;
/** TEMPORARY: turns each player gets are cut by this much per station, down to the floor. */
export const STATION_TURNS = 2;
export const MIN_TURNS = 8;
export const MAX_TICKET = 20;

/** Where rent houses go, in the order they are built: busy squares near forks and corners. */
export const HOUSE_SPOTS = ["o2", "o18", "o10", "o26", "o6", "o22"] as const;

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

export type Realm = {
  size: RealmSize;
  /** One entry per build slot. */
  slots: (BuildingKind | null)[];
  ticket: number;
  deck: DeckId;
};

export const REALM_KEY = "boolionaire-realm-v1";

export function newRealm(size: RealmSize = "small"): Realm {
  return { size, slots: Array.from({ length: SIZES[size].slots }, () => null), ticket: 10, deck: "standard" };
}

export function count(realm: Realm, kind: BuildingKind): number {
  return realm.slots.filter((slot) => slot === kind).length;
}

/** Tables you can run at once: 1, plus one per 加枱, never above the size's limit. */
export function tablesOf(realm: Realm): number {
  return Math.min(SIZES[realm.size].tables, 1 + count(realm, "table"));
}

export function turnsOf(realm: Realm): number {
  return Math.max(MIN_TURNS, TURNS_EACH - STATION_TURNS * count(realm, "station"));
}

/** Which squares are rent houses. */
export function housesOf(realm: Realm): string[] {
  return HOUSE_SPOTS.slice(0, count(realm, "rent"));
}

export function buildCost(realm: Realm): number {
  return realm.slots.reduce((sum, slot) => sum + (slot ? BUILD_COST[slot] : 0), 0);
}

/** Whether another building of this kind fits (加枱 stops once the size's table limit is reached). */
export function canBuild(realm: Realm, kind: BuildingKind): boolean {
  if (!realm.slots.includes(null)) return false;
  if (kind === "table") return tablesOf(realm) < SIZES[realm.size].tables;
  if (kind === "rent") return count(realm, "rent") < HOUSE_SPOTS.length;
  if (kind === "station") return turnsOf(realm) > MIN_TURNS;
  return true;
}

export function build(realm: Realm, slot: number, kind: BuildingKind): Realm {
  if (realm.slots[slot] !== null || !canBuild(realm, kind)) return realm;
  return { ...realm, slots: realm.slots.map((value, index) => (index === slot ? kind : value)) };
}

export function demolish(realm: Realm, slot: number): Realm {
  return { ...realm, slots: realm.slots.map((value, index) => (index === slot ? null : value)) };
}

/** Change size: keep what fits, in order; extra 加枱 above the new limit are dropped. */
export function resize(realm: Realm, size: RealmSize): Realm {
  let next: Realm = { ...realm, size, slots: Array.from({ length: SIZES[size].slots }, () => null) };
  realm.slots.forEach((kind) => {
    if (!kind) return;
    const free = next.slots.indexOf(null);
    if (free >= 0) next = build(next, free, kind);
  });
  return next;
}

export function setTicket(realm: Realm, ticket: number): Realm {
  return { ...realm, ticket: Math.max(0, Math.min(MAX_TICKET, Math.round(ticket))) };
}

/** The table rules a hosted game on this realm plays by. */
export function rulesOf(realm: Realm): Partial<TableRules> {
  return {
    turnsEach: turnsOf(realm),
    houses: Object.fromEntries(housesOf(realm).map((key) => [key, Math.min(RENT_CAP, HOUSE_RENT)])),
    cards: count(realm, "chance") > 0 ? DECKS[realm.deck] : CARDS,
  };
}

/** What one hosted game paid the host. A 0 ticket is a free points game. */
export function hostReport(realm: Realm, guests: number, houseRent: number) {
  const tickets = realm.ticket * guests;
  const cut = Math.ceil(tickets * TICKET_CUT);
  const net = tickets - cut + houseRent;
  return { tickets, cut, houseRent, net, perRound: net * tablesOf(realm), tables: tablesOf(realm) };
}

export function parseRealm(value: unknown): Realm {
  if (!value || typeof value !== "object") return newRealm();
  const raw = value as Partial<Realm>;
  const size: RealmSize = raw.size === "medium" || raw.size === "large" ? raw.size : "small";
  let realm = newRealm(size);
  const kinds = Array.isArray(raw.slots) ? raw.slots : [];
  kinds.forEach((kind) => {
    const free = realm.slots.indexOf(null);
    if (free >= 0 && BUILDING_KINDS.includes(kind as BuildingKind)) realm = build(realm, free, kind as BuildingKind);
  });
  realm = setTicket(realm, typeof raw.ticket === "number" ? raw.ticket : 10);
  const deck: DeckId = raw.deck === "wild" || raw.deck === "calm" ? raw.deck : "standard";
  return { ...realm, deck };
}
