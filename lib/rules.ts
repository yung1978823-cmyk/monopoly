export const DICE_CAP = 20;
/** One die comes back every 3 minutes, up to DICE_CAP. */
export const REFILL_MS = 3 * 60 * 1000;
export const DAILY_DST_CAP = 5;
export const LANDMARK_SLOTS = 4;
/** Up to five NFTs can be placed; each adds the same +2 attack, so no single one decides a fight. */
export const NFT_SLOTS = 5;
export const NFT_ATTACK = 2;

/** Chance (0–100) that an attack lands: 50% when evenly matched, ±4% per point of power,
 * never below 15% or above 85% — no fight is ever certain or hopeless. */
export const HIT_BASE = 50;
export const HIT_PER_POINT = 4;
export const HIT_MIN = 15;
export const HIT_MAX = 85;

export function hitChance(attack: number, defense: number): number {
  return Math.max(HIT_MIN, Math.min(HIT_MAX, HIT_BASE + HIT_PER_POINT * (attack - defense)));
}

/** Points for a landed smash: 3 when evenly matched, more for beating a stronger rival, 1–5. */
export function smashPoints(attack: number, defense: number): number {
  return Math.max(1, Math.min(5, 3 + Math.round((defense - attack) / 5)));
}

/** Total attack the placed NFTs add: +2 each, up to +10. */
export function nftAttack(count: number): number {
  return Math.max(0, Math.min(NFT_SLOTS, count)) * NFT_ATTACK;
}

/** What each square pays. Penalties are small and never take points below zero. */
export const POINTS = {
  start: 2,
  coin: 2,
  jail: -2,
  tax: -3,
} as const;

/** A chest pays a random 3–6 points. */
export const CHEST_MIN = 3;
export const CHEST_MAX = 6;
export const CHEST_DEFAULT = 4;

/** Points spent to raise the 1st, 2nd, 3rd and 4th landmark. Tunable. */
export const BUILD_COSTS = [5, 10, 15, 20] as const;

/** Cost of the next landmark given how many are already built, or null when all four stand. */
export function buildCost(built: number): number | null {
  return BUILD_COSTS[built] ?? null;
}

/** A smashed landmark comes back for half its build price, rounded up. */
export function repairCost(fullCost: number): number {
  return Math.ceil(fullCost / 2);
}

export function applyRefill(
  dice: number,
  lastRefillAt: number,
  now: number,
): { dice: number; lastRefillAt: number; gained: number } {
  if (dice >= DICE_CAP) {
    return { dice: DICE_CAP, lastRefillAt, gained: 0 };
  }
  if (!(now > lastRefillAt)) {
    return { dice, lastRefillAt, gained: 0 };
  }
  const intervals = Math.floor((now - lastRefillAt) / REFILL_MS);
  if (intervals <= 0) {
    return { dice, lastRefillAt, gained: 0 };
  }
  const added = Math.min(DICE_CAP - dice, intervals);
  const diceNext = dice + added;
  if (diceNext >= DICE_CAP) {
    return { dice: DICE_CAP, lastRefillAt: now, gained: added };
  }
  return {
    dice: diceNext,
    lastRefillAt: lastRefillAt + added * REFILL_MS,
    gained: added,
  };
}

export function spendDice(
  dice: number,
  lastRefillAt: number,
  now: number,
  count = 1,
): { dice: number; lastRefillAt: number } | null {
  if (count <= 0 || dice < count) return null;
  return {
    dice: dice - count,
    lastRefillAt: dice >= DICE_CAP ? now : lastRefillAt,
  };
}

export function addTestDie(dice: number): number {
  return Math.min(DICE_CAP, dice + 1);
}

export function msUntilNextDie(
  dice: number,
  lastRefillAt: number,
  now: number,
): number | null {
  if (dice >= DICE_CAP) return null;
  const elapsed = Math.max(0, now - lastRefillAt);
  const into = elapsed % REFILL_MS;
  return into === 0 ? REFILL_MS : REFILL_MS - into;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function dayKeyOf(now: number): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}
