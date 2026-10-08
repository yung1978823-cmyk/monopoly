/**
 * 商店 (Sky 2026-10-08): 抽卡 (3D characters and 領地 houses), 能量 packs (real money later; test buttons now),
 * materials and a daily 精選, all paid in the 領地 wallet's 能量 (table units, shown ×10,000). Rewarded ads: at most
 * ADS_PER_DAY a day, shared by the shop's free claims and the single-player 雙倍 offers.
 *
 * 抽卡 odds are published on screen (App Store / Google Play rule for paid random items).
 */
import type { BuildingKind, Stock } from "@/lib/realm";

export type Rarity = "N" | "R" | "SR" | "SSR";
export const RARITIES: readonly Rarity[] = ["SSR", "SR", "R", "N"];
/** Chance of each rarity per draw, in percent (shown on the 機率 page). */
export const ODDS: Record<Rarity, number> = { SSR: 1, SR: 9, R: 30, N: 60 };
/** The 50th draw without an SSR is an SSR. */
export const PITY = 50;
/** Prices in 能量 (table units). Ten at once costs nine and holds at least one SR or better. */
export const PULL_PRICE = 10;
export const TEN_PRICE = 90;

export const ADS_PER_DAY = 14;
/** What one free ad in the shop gives: 能量 or a bundle of materials (you pick). */
export const AD_ENERGY = 20;
export const AD_MATERIALS: Stock = { wood: 3, stone: 2, gold: 0 };

export type PoolId = "hero" | "house";
/** A thing a draw can give. */
export type Prize =
  | { kind: "hero"; id: string }
  | { kind: "house"; id: BuildingKind }
  | { kind: "materials"; stock: Stock };

/** Characters: the four you start with are R; 阿狼 and 阿鬼 are SR, 阿蝠 SSR (new, drawn art to come). */
export const HEROES: { id: string; name: string; rarity: Rarity; avatar?: string; emoji?: string }[] = [
  { id: "vampire", name: "伯爵", rarity: "R", avatar: "/art/avatars/vampire.jpg" },
  { id: "jiangshi", name: "阿殭", rarity: "R", avatar: "/art/avatars/jiangshi.jpg" },
  { id: "mummy", name: "阿木", rarity: "R", avatar: "/art/avatars/mummy.jpg" },
  { id: "zombie", name: "阿強", rarity: "R", avatar: "/art/avatars/zombie.jpg" },
  { id: "wolf", name: "阿狼", rarity: "SR", emoji: "🐺" },
  { id: "ghost", name: "阿鬼", rarity: "SR", emoji: "👻" },
  { id: "bat", name: "阿蝠", rarity: "SSR", emoji: "🦇" },
];
/** Houses: a 房屋券 builds that building on your 領地 without materials. */
export const HOUSES: { id: BuildingKind; rarity: Rarity }[] = [
  { id: "facade", rarity: "R" },
  { id: "chance", rarity: "R" },
  { id: "rent", rarity: "SR" },
  { id: "station", rarity: "SR" },
  { id: "table", rarity: "SSR" },
];
/** N draws give a little material instead. */
const N_PRIZE: Record<PoolId, Stock> = { hero: { wood: 3, stone: 1, gold: 0 }, house: { wood: 2, stone: 2, gold: 0 } };
/** A character you already have turns into this many 碎片. */
export const DUPLICATE_SHARDS = 5;

export type Collection = {
  heroes: Record<string, number>;
  shards: number;
  /** 房屋券 by building kind. */
  vouchers: Partial<Record<BuildingKind, number>>;
  /** Draws since the last SSR, per pool. */
  sinceSSR: Record<PoolId, number>;
  /** 新手禮包 bought; 月卡 runs until this day (YYYY-MM-DD) and was last claimed on `monthClaimed`. */
  starter: boolean;
  monthUntil: string | null;
  monthClaimed: string | null;
  /** 精選 bought today (day key → item ids). */
  deals: { day: string; bought: string[] };
  /** Rewarded ads watched today. */
  ads: { day: string; watched: number };
};

export function newCollection(): Collection {
  return {
    heroes: { vampire: 1, jiangshi: 1, mummy: 1, zombie: 1 },
    shards: 0,
    vouchers: {},
    sinceSSR: { hero: 0, house: 0 },
    starter: false,
    monthUntil: null,
    monthClaimed: null,
    deals: { day: "", bought: [] },
    ads: { day: "", watched: 0 },
  };
}

export function adsLeft(c: Collection, day: string): number {
  return ADS_PER_DAY - (c.ads.day === day ? c.ads.watched : 0);
}
export function watchAd(c: Collection, day: string): Collection | null {
  if (adsLeft(c, day) <= 0) return null;
  return { ...c, ads: { day, watched: (c.ads.day === day ? c.ads.watched : 0) + 1 } };
}

/** Pick a rarity from a random number in [0, 1), with the pity counter. */
export function rollRarity(r: number, sinceSSR: number): Rarity {
  if (sinceSSR + 1 >= PITY) return "SSR";
  let at = r * 100;
  for (const rarity of RARITIES) {
    if (at < ODDS[rarity]) return rarity;
    at -= ODDS[rarity];
  }
  return "N";
}

function prizeOf(pool: PoolId, rarity: Rarity, r: number): Prize {
  if (rarity === "N") return { kind: "materials", stock: { ...N_PRIZE[pool] } };
  if (pool === "hero") {
    const list = HEROES.filter((h) => h.rarity === rarity);
    return { kind: "hero", id: list[Math.floor(r * list.length) % list.length].id };
  }
  const list = HOUSES.filter((h) => h.rarity === rarity);
  return { kind: "house", id: list[Math.floor(r * list.length) % list.length].id };
}

export type Pull = { rarity: Rarity; prize: Prize; duplicate: boolean };

/**
 * Draw `times` (1 or 10) from a pool. `random` gives numbers in [0, 1). A ten-draw with nothing SR or better
 * turns its last draw into an SR. Returns the draws and the collection with everything added (materials are
 * returned separately for the wallet).
 */
export function draw(c: Collection, pool: PoolId, times: 1 | 10, random: () => number): { pulls: Pull[]; collection: Collection; materials: Stock } {
  let since = c.sinceSSR[pool];
  const rarities: Rarity[] = [];
  for (let k = 0; k < times; k++) {
    const rarity = rollRarity(random(), since);
    since = rarity === "SSR" ? 0 : since + 1;
    rarities.push(rarity);
  }
  if (times === 10 && !rarities.some((r) => r === "SR" || r === "SSR")) rarities[9] = "SR";
  let next: Collection = { ...c, heroes: { ...c.heroes }, vouchers: { ...c.vouchers }, sinceSSR: { ...c.sinceSSR, [pool]: since } };
  const materials: Stock = { wood: 0, stone: 0, gold: 0 };
  const pulls = rarities.map((rarity) => {
    const prize = prizeOf(pool, rarity, random());
    let duplicate = false;
    if (prize.kind === "hero") {
      duplicate = (next.heroes[prize.id] ?? 0) > 0;
      if (duplicate) next = { ...next, shards: next.shards + DUPLICATE_SHARDS };
      next.heroes[prize.id] = (next.heroes[prize.id] ?? 0) + 1;
    } else if (prize.kind === "house") {
      next.vouchers[prize.id] = (next.vouchers[prize.id] ?? 0) + 1;
    } else {
      materials.wood += prize.stock.wood;
      materials.stone += prize.stock.stone;
      materials.gold += prize.stock.gold;
    }
    return { rarity, prize, duplicate };
  });
  return { pulls, collection: next, materials };
}

/** 能量 packs. Real money through App Store / Google Play later; for now test buttons add the 能量 straight away. */
export const PACKS = [
  { id: "starter", name: "新手禮包", price: "HK$8", energy: 300, gold: 5, once: true },
  { id: "small", name: "細能量包", price: "HK$8", energy: 100, gold: 0, once: false },
  { id: "mid", name: "中能量包", price: "HK$38", energy: 550, gold: 0, once: false },
  { id: "big", name: "大能量包", price: "HK$78", energy: 1200, gold: 0, once: false },
] as const;
/** 月卡: 30 days, claim this much 能量 each day. */
export const MONTH_CARD = { price: "HK$38", days: 30, daily: 30 } as const;

/** Material bundles for 能量. */
export const MATERIAL_BUNDLES: { id: string; stock: Stock; price: number }[] = [
  { id: "wood10", stock: { wood: 10, stone: 0, gold: 0 }, price: 18 },
  { id: "stone10", stock: { wood: 0, stone: 10, gold: 0 }, price: 27 },
  { id: "gold5", stock: { wood: 0, stone: 0, gold: 5 }, price: 36 },
];

/** 精選: two offers a day, chosen from the day — a house voucher or a character at a discount. */
export type Deal = { id: string; prize: Prize; price: number; was: number };
export function dealsOf(day: string): Deal[] {
  let h = 2166136261;
  for (let k = 0; k < day.length; k++) h = Math.imul(h ^ day.charCodeAt(k), 16777619) >>> 0;
  const house = HOUSES.filter((x) => x.rarity === "SR")[h % 2];
  const hero = HEROES.filter((x) => x.rarity === "SR")[(h >>> 3) % 2];
  return [
    { id: `house-${house.id}`, prize: { kind: "house", id: house.id }, price: 60, was: 100 },
    { id: `hero-${hero.id}`, prize: { kind: "hero", id: hero.id }, price: 120, was: 200 },
  ];
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseCollection(value: unknown): Collection {
  const base = newCollection();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<Collection>;
  const num = (n: unknown) => (typeof n === "number" && n >= 0 ? Math.floor(n) : 0);
  const heroes: Record<string, number> = { ...base.heroes };
  for (const h of HEROES) if (raw.heroes && num(raw.heroes[h.id]) > 0) heroes[h.id] = num(raw.heroes[h.id]);
  const vouchers: Collection["vouchers"] = {};
  for (const h of HOUSES) if (raw.vouchers && num(raw.vouchers[h.id]) > 0) vouchers[h.id] = num(raw.vouchers[h.id]);
  const str = (s: unknown) => (typeof s === "string" ? s : null);
  return {
    heroes,
    shards: num(raw.shards),
    vouchers,
    sinceSSR: { hero: num(raw.sinceSSR?.hero), house: num(raw.sinceSSR?.house) },
    starter: raw.starter === true,
    monthUntil: str(raw.monthUntil),
    monthClaimed: str(raw.monthClaimed),
    deals: { day: str(raw.deals?.day) ?? "", bought: Array.isArray(raw.deals?.bought) ? raw.deals!.bought.filter((x) => typeof x === "string") : [] },
    ads: { day: str(raw.ads?.day) ?? "", watched: num(raw.ads?.watched) },
  };
}
export const COLLECTION_KEY = "boolionaire-collection-v1";
