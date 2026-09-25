export const DICE_CAP = 20;
export const REFILL_MS = 30 * 60 * 1000;
export const DAILY_DST_CAP = 5;
export const LANDMARK_SLOTS = 4;

export const POINTS = {
  land: 1,
  start: 2,
} as const;

/** Points spent to raise the 1st, 2nd, 3rd and 4th landmark. Tunable. */
export const BUILD_COSTS = [5, 10, 15, 20] as const;

/** Cost of the next landmark given how many are already built, or null when all four stand. */
export function buildCost(built: number): number | null {
  return BUILD_COSTS[built] ?? null;
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
