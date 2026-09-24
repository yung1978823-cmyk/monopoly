export const DICE_CAP = 20;
export const ROLL_COST = 2;
export const REFILL_MS = 30 * 60 * 1000;
export const DAILY_DST_CAP = 5;
export const PURSE_MAX = 5;
export const LANDMARK_SLOTS = 4;

export const POINTS = {
  land: 1,
  start: 2,
  build: 3,
  attackMissAttacker: 1,
  attackMissDefender: 1,
  attackHitAttacker: 2,
  attackHitDefender: 1,
} as const;

export type AttackBand = "below" | "equal" | "above";

export function attackBand(attack: number, defense: number): AttackBand {
  if (attack < defense) return "below";
  if (attack === defense) return "equal";
  return "above";
}

/** Uncapped-by-purse amount. Attack is combat power plus luck. Still clamped to 5. */
export function rawDst(attack: number, defense: number): number {
  if (attack < defense) return 0;
  if (attack === defense) return 1;
  return Math.min(DAILY_DST_CAP, Math.max(2, attack - defense + 1));
}

export function dstTaken(args: {
  attack: number;
  defense: number;
  defenderHasNft: boolean;
  remainingPurse: number;
  stolenToday: number;
}): number {
  if (!args.defenderHasNft) return 0;
  const room = Math.max(0, DAILY_DST_CAP - args.stolenToday);
  const purse = Math.max(0, args.remainingPurse);
  if (room === 0 || purse === 0) return 0;
  return Math.min(rawDst(args.attack, args.defense), purse, room);
}

export function landmarkIsSmashed(
  attack: number,
  defense: number,
  targetIsBuilt: boolean,
): boolean {
  return targetIsBuilt && defense > 0 && attack >= defense;
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

export function spendDie(
  dice: number,
  lastRefillAt: number,
  now: number,
): { dice: number; lastRefillAt: number } | null {
  return spendDice(dice, lastRefillAt, now, 1);
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
