/**
 * Your monster: it lives in the middle of your town and does your attacking. Pick one of the five
 * elements (金木水火土) at the start; it grows through five stages on 🍖 肉 (from the board) and
 * 🧪 營養液 (only stolen from rivals' stores). Each day it eats; go hungry two days running and it
 * drops back a stage. NFT holders' monsters are the legendary series — the element's divine beast.
 */
export type Pet = {
  /** Index into ELEMENTS. */
  element: number;
  /** 0 蛋, 1 幼仔, 2 少年, 3 成年, 4 王者. */
  stage: number;
  /** Days in a row it went without its daily food (two drops a stage). */
  hungry: number;
};

export const ELEMENTS = [
  { id: "metal", name: "金", beast: "小鋼甲獸", legend: "白虎", colour: "#D4A017" },
  { id: "wood", name: "木", beast: "樹角鹿仔", legend: "青龍", colour: "#3FA34D" },
  { id: "water", name: "水", beast: "小海龍", legend: "玄武", colour: "#2F80ED" },
  { id: "fire", name: "火", beast: "火尾狐", legend: "朱雀", colour: "#EB5A2A" },
  { id: "earth", name: "土", beast: "石殼龜", legend: "麒麟", colour: "#A0703C" },
] as const;

export const STAGE_NAMES = ["蛋", "幼仔", "少年", "成年", "王者"] as const;
export const TOP_STAGE = STAGE_NAMES.length - 1;
/** 🍖 and 🧪 to grow from each stage to the next (the last stage has nowhere to go). */
export const STAGE_NEED: readonly (readonly [number, number])[] = [
  [20, 2],
  [100, 12],
  [260, 40],
  [600, 100],
];
/** Attack at each stage. */
export const STAGE_ATTACK = [10, 16, 24, 34, 46] as const;
/** What it eats each day at each stage (🍖, 🧪). An egg eats nothing. */
export const UPKEEP: readonly (readonly [number, number])[] = [
  [0, 0],
  [3, 0],
  [6, 1],
  [8, 2],
  [10, 2],
];
/** Hungry days in a row before it drops a stage. */
export const HUNGRY_DROP = 2;
/** Legendary (NFT) monsters hit a tenth harder. */
export const LEGEND_BONUS = 1.1;

export function petAttack(pet: Pet | null, legend = false): number {
  if (!pet) return STAGE_ATTACK[0];
  const base = STAGE_ATTACK[Math.max(0, Math.min(TOP_STAGE, pet.stage))];
  return legend ? Math.round(base * LEGEND_BONUS) : base;
}

export function petName(pet: Pet, legend = false): string {
  const element = ELEMENTS[pet.element] ?? ELEMENTS[0];
  return legend ? element.legend : element.beast;
}

/** What it takes to grow to the next stage, or null at the top. */
export function growNeed(pet: Pet): readonly [number, number] | null {
  return STAGE_NEED[pet.stage] ?? null;
}

/**
 * A day goes by: the monster eats its ration from your store if it can; otherwise it goes hungry,
 * and a second hungry day in a row knocks it back a stage (never below 幼仔 once hatched).
 */
export function eatForDay(pet: Pet, meat: number, juice: number): { pet: Pet; meat: number; juice: number; ate: boolean; dropped: boolean } {
  const [needMeat, needJuice] = UPKEEP[pet.stage] ?? [0, 0];
  if (meat >= needMeat && juice >= needJuice) {
    return { pet: { ...pet, hungry: 0 }, meat: meat - needMeat, juice: juice - needJuice, ate: true, dropped: false };
  }
  const hungry = pet.hungry + 1;
  if (hungry >= HUNGRY_DROP && pet.stage > 1) {
    return { pet: { ...pet, stage: pet.stage - 1, hungry: 0 }, meat, juice, ate: false, dropped: true };
  }
  return { pet: { ...pet, hungry: Math.min(hungry, HUNGRY_DROP) }, meat, juice, ate: false, dropped: false };
}

/** Whole days from one day key (YYYY-MM-DD) to another, 0 when the same or going backwards. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}
