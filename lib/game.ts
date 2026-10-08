import { LANDMARK_NAMES, TILES, TILE_INFO, type TileKind } from "./board";
import { CHARACTERS } from "./characters";
import { coinEnergy, formatEnergy } from "./energy";
import { THEMES } from "./themes";
import { ELEMENTS, HATCH_ROLLS, TYPE_EDGE, typeEdge, TOP_STAGE, daysBetween, eatForDay, growNeed, petAttack, petName, STAGE_NAMES, type Pet } from "./pet";
import {
  CHEST_DEFAULT,
  CHEST_MAX,
  CHEST_MIN,
  DICE_CAP,
  HIT_BASE,
  HIT_MAX,
  HIT_MIN,
  NFT_ATTACK,
  NFT_SLOTS,
  BUILDINGS,
  LEVEL_ATTACK,
  THEME_ATTACK,
  THEME_REWARD_DICE,
  themeRewardCoins,
  MAX_LEVEL,
  POINTS,
  holeLoss,
  hitChance,
  levelCost,
  nftAttack,
  smashPoints,
  addTestDie,
  applyRefill,
  repairCost,
  spendDice,
} from "./rules";

export type LogTone = "you" | "rule";

export type LogEntry = {
  id: number;
  tone: LogTone;
  text: string;
};

export type DiePair = [number, number];

export type Phase = "walk" | "search" | "steal" | "shop";

/**
 * One of the nine crates in a rival's store on 偷嘢 (Sky 2026-10-01): you open three. Mostly 💎 水晶 or 🍖,
 * a rarer bag of 能量 or a die, now and then the 大寶箱 jackpot — and three dangers: the 老鼠夾 ends the raid
 * (you keep what you took), the 炸彈 ends it and blows up everything taken so far, the 鬧鐘 costs a pick.
 */
export type StealKind = "juice" | "meat" | "coins" | "dice" | "jackpot" | "trap" | "bomb" | "alarm";
export type StealBox = { kind: StealKind; amount: number };
export const STEAL_CRATES = 9;
/** Crates that hurt instead of paying. */
export const STEAL_DANGERS: StealKind[] = ["trap", "bomb", "alarm"];
export const STEAL_PICKS = 3;
/** The 大寶箱 jackpot: this much money (×100 能量 on screen) and 💎 at once. */
export const JACKPOT = { coins: 20, juice: 3 } as const;
/** 🍖 each meat square gives. */
export const MEAT_PER_SQUARE = 2;
/**
 * 幸運轉盤 (Sky 2026-10-08): the wheel's six prizes, clockwise from the top. The page spins it (picking a slice by
 * WHEEL_WEIGHTS) and the game pays what it stopped on.
 */
export const WHEEL_PRIZES = [
  { coins: 3, dice: 0, meat: 0, juice: 0 },
  { coins: 0, dice: 2, meat: 0, juice: 0 },
  { coins: 0, dice: 0, meat: 4, juice: 0 },
  { coins: 8, dice: 0, meat: 0, juice: 0 },
  { coins: 0, dice: 0, meat: 0, juice: 2 },
  { coins: 20, dice: 1, meat: 0, juice: 0 },
] as const;
/** How likely each slice is (the last is the jackpot). */
export const WHEEL_WEIGHTS = [28, 20, 20, 18, 10, 4] as const;
/**
 * 神秘商人 (Sky 2026-10-08): three offers a day, bought with 能量 (prices in coins: 1 coin = 100 能量). The prices
 * (and a daily 特價) are picked from the day, so everyone sees the same shop all day and a new one tomorrow.
 */
export type ShopItem = "dice" | "meat" | "juice";
export type ShopOffer = { item: ShopItem; amount: number; price: number; deal: boolean };
const SHOP_BASE: Record<ShopItem, { amount: number; low: number; high: number }> = {
  dice: { amount: 2, low: 5, high: 8 },
  meat: { amount: 5, low: 3, high: 6 },
  juice: { amount: 1, low: 5, high: 9 },
};
function dayHash(dayKey: string): number {
  let h = 2166136261;
  for (let k = 0; k < dayKey.length; k++) h = Math.imul(h ^ dayKey.charCodeAt(k), 16777619) >>> 0;
  return h;
}
export function shopOffers(dayKey: string): ShopOffer[] {
  let h = dayHash(dayKey || "day");
  const next = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0), h / 4294967296);
  const deal = Math.floor(next() * 3);
  return (["dice", "meat", "juice"] as ShopItem[]).map((item, k) => {
    const base = SHOP_BASE[item];
    const price = base.low + Math.floor(next() * (base.high - base.low + 1));
    return k === deal
      ? { item, amount: base.amount * 2, price: Math.max(1, Math.round(price * 1.4)), deal: true }
      : { item, amount: base.amount, price, deal: false };
  });
}
/**
 * 龍巢 (Sky 2026-10-08, in place of 起點): stopping on it feeds your dragon for free — food sized to its grade, so a
 * bigger dragon gets a bigger meal. An egg in the nest gets warmed: it hatches NEST_EGG_ROLLS rolls sooner.
 */
export const NEST_FOOD: readonly (readonly [number, number])[] = [
  [0, 0],
  [8, 1],
  [14, 2],
  [20, 3],
  [24, 4],
];
export const NEST_EGG_ROLLS = 6;
/** Without a dragon the nest still leaves a little meat. */
export const NEST_NO_PET_MEAT = 4;
/** Which landings can be doubled by an ad: the ones that pay out something good. */
export const DOUBLE_KINDS: readonly TileKind[] = ["chest", "wheel", "start"];
export function canDouble(l: Landing): boolean {
  return DOUBLE_KINDS.includes(l.kind) && (l.points > 0 || l.dice > 0 || l.meat > 0 || (l.juice ?? 0) > 0);
}
export function spinWheel(r: number): number {
  const total = WHEEL_WEIGHTS.reduce((a, b) => a + b, 0);
  let at = r * total;
  for (let k = 0; k < WHEEL_WEIGHTS.length; k++) {
    if (at < WHEEL_WEIGHTS[k]) return k;
    at -= WHEEL_WEIGHTS[k];
  }
  return 0;
}

export type WeaponReadout = {
  weapon: number;
  attackTotal: number;
  defenseTotal: number;
  /** Chance the strike had to land, 15–85. */
  chance: number;
  enemyLuck: number;
  hit: boolean;
  /** Legacy: DST was taken on a hit before 能量 replaced it. Always 0 now. */
  dst: number;
  pointsGained: number;
  shieldBreak: boolean;
  /** The rival building this attack knocked down a level, if any. */
  smashed: number | null;
  /** Attribute match-up: +1 your dragon beats theirs, −1 theirs beats yours, 0 neither. */
  edge: -1 | 0 | 1;
};

/** What the last stop did, for the picture shown on the board. */
export type Landing = {
  kind: TileKind;
  /** 睇廣告雙倍 (Sky 2026-10-08): the reward was doubled once by watching an ad. */
  doubled?: boolean;
  /** Points actually gained (negative for jail or the black hole), start bonus included. */
  points: number;
  /** Dice gained. */
  dice: number;
  /** 🍖 gained. */
  meat: number;
  passedStart: boolean;
  /** 龍捲風: the walk stopped on the tornado square and you were blown on to this square (what it did is above). */
  tornado?: boolean;
  /** 幸運轉盤: which slice the wheel stopped on. */
  wheel?: number;
  /** 💎 gained (from the wheel). */
  juice?: number;
};

export type GameState = {
  phase: Phase;
  position: number;
  dice: number;
  lastRefillAt: number;
  points: number;
  /** Your monster, once picked (null until then). */
  pet: Pet | null;
  /** Your store of 🍖 肉 and 💎 水晶 (monster food). */
  meat: number;
  juice: number;
  /** The three crates in the rival's store while stealing, and which one you took. */
  stealBoxes: StealBox[] | null;
  /** Crates opened so far on this raid, in order. */
  stealOpened: number[];
  /** 神秘商人: which of today's offers you bought this visit. */
  shopBought: number[];
  /** Which theme (page) of your town you are building now, 0 = the first. Earlier pages are finished and locked. */
  theme: number;
  /** The five buildings' levels on the current page, 0 (empty plot) to 5. */
  levels: number[];
  /** The highest level each building has reached; levels below it are repairs at half price. */
  best: number[];
  /** The current rival's building levels on the page they are on now. */
  rivalLevels: number[];
  /** Which theme (page) the current rival is on (an index into THEMES). */
  rivalCity: number;
  /** Who the current rival is (an index into CHARACTERS). */
  rivalFace: number;
  /** The current rival's dragon attribute (an index into ELEMENTS). */
  rivalElement: number;
  /** The five NFT slots: each holds an NFT id or is empty. Any NFT placed means you hold one. */
  nfts: (string | null)[];
  rivalHasNft: boolean;
  /** How many NFTs the current rival has placed (0 without an NFT). */
  rivalNfts: number;
  /** Legacy: DST taken today, from before 能量 replaced DST. Always 0 now. */
  dstTakenToday: number;
  rollCount: number;
  /** Fights settled so far; the first one gets a pointing hand. */
  strikes: number;
  log: LogEntry[];
  nextLogId: number;
  dayKey: string;
  /** The two dice of the last walk. */
  walkFaces: DiePair | null;
  lastRivalFaces: DiePair | null;
  enemyLuck: number | null;
  enemyShield: boolean;
  fightSettled: boolean;
  weaponReadout: WeaponReadout | null;
  landing: Landing | null;
};

export type Action =
  | { type: "tick"; now: number; dayKey: string }
  | { type: "add-test-die" }
  | {
      type: "move";
      faces: DiePair;
      enemyDice?: DiePair | null;
      /** The levels of the rival met on an 攻擊 square, one per building on their page (0–5). */
      rivalLevels?: number[];
      /** Which theme (page) that rival is on. */
      rivalCity?: number;
      /** Who that rival is (an index into CHARACTERS). */
      rivalFace?: number;
      /** That rival's dragon attribute. */
      rivalElement?: number;
      /** How many NFTs that rival has placed (1–5), when they hold any. */
      rivalNfts?: number;
      /** Points in the chest, if the walk stops on 寶箱 (3–6). */
      chest?: number;
      /** The chest holds 🍖 instead of coins (the same 3–6). */
      chestMeat?: boolean;
      /** The three crates found on 🦝 偷嘢. */
      stealBoxes?: StealBox[];
      /** Where the 龍捲風 blows you if the walk stops on it (any other square; defaults to 3 back). */
      tornado?: number;
      /** The slice the 幸運轉盤 stops on, if the walk stops on one (0–5). */
      wheel?: number;
      now: number;
    }
  | { type: "weapon"; target?: number | null; /** A random number in [0, 1) deciding the hit. */ roll?: number }
  | { type: "raided"; target: number }
  | { type: "upgrade"; building: number }
  | { type: "pick-pet"; element: number }
  | { type: "grow-pet" }
  | { type: "steal-pick"; index: number }
  | { type: "shop-buy"; index: number }
  /** 睇廣告雙倍: the last landing's reward again (chest, wheel, 龍巢 only), once. */
  | { type: "ad-double" }
  | { type: "return-walk" }
  | { type: "place-nft"; slot: number; id: string }
  | { type: "remove-nft"; slot: number }
  | { type: "set-rival-nft"; value: boolean }
  | { type: "reset"; now: number; dayKey: string }
  | { type: "hydrate"; state: GameState; now: number; dayKey: string };

export const STORAGE_KEY = "dafuweng-daily-board-v4";
export const STARTING_DICE = 2;

const noLevels = (): number[] => Array.from({ length: BUILDINGS }, () => 0);
const emptyNfts = (): (string | null)[] => Array.from({ length: NFT_SLOTS }, () => null);

/** How many NFTs sit in your slots. */
export function nftCount(state: Pick<GameState, "nfts">): number {
  return state.nfts.filter((id) => id !== null).length;
}

/** Placing any NFT counts as holding one: that unlocks the legendary dragon and adds attack. */
export function holdsNft(state: Pick<GameState, "nfts">): boolean {
  return nftCount(state) > 0;
}

/** Whether every building on the page is at the top level (the page is finished). */
export function pageDone(levels: readonly number[]): boolean {
  return levels.length > 0 && levels.every((level) => level >= MAX_LEVEL);
}

/** Pages finished for good: every page before the current one, plus the current one if it is full. */
export function themesDone(state: Pick<GameState, "theme" | "levels">): number {
  return state.theme + (pageDone(state.levels) ? 1 : 0);
}

/** All standing levels added up, 0–25 for a full page. */
export function totalLevels(levels: readonly number[]): number {
  return levels.reduce((sum, level) => sum + level, 0);
}

/** The rival's power, on the same scale as yours: 10, +10 per page they finished, +2 per standing level, +2 per NFT. */
export function rivalPower(state: Pick<GameState, "rivalLevels" | "rivalNfts" | "rivalCity">): number {
  return 10 + state.rivalCity * THEME_ATTACK + totalLevels(state.rivalLevels) * LEVEL_ATTACK + nftAttack(state.rivalNfts);
}

/** Your hatched dragon against the rival's: +1 you beat their attribute, −1 they beat yours. */
export function matchUp(state: Pick<GameState, "pet" | "rivalElement">): -1 | 0 | 1 {
  return state.pet && state.pet.stage > 0 ? typeEdge(state.pet.element, state.rivalElement) : 0;
}

/** Attack power: your monster's (10 as an egg, up to 46 as 王者; a tenth more for a legendary NFT
 * monster), plus +2 per NFT placed. Buildings are for defence. */
export function attackPower(state: Pick<GameState, "pet" | "nfts">): number {
  return petAttack(state.pet, holdsNft(state)) + nftAttack(nftCount(state));
}

/** Your defence, on the same scale as a rival's: 10, +10 per finished page, +2 per standing level on this page, +2 per NFT. */
export function defencePower(state: Pick<GameState, "theme" | "levels" | "nfts">): number {
  return 10 + state.theme * THEME_ATTACK + totalLevels(state.levels) * LEVEL_ATTACK + nftAttack(nftCount(state));
}

export function createGame(now: number, dayKey: string): GameState {
  return {
    phase: "walk",
    position: 0,
    dice: STARTING_DICE,
    lastRefillAt: now,
    points: 0,
    pet: null,
    meat: 0,
    juice: 0,
    stealBoxes: null,
    stealOpened: [],
    shopBought: [],
    theme: 0,
    levels: noLevels(),
    best: noLevels(),
    rivalLevels: [2, 1, 0, 0, 0],
    rivalCity: 0,
    rivalFace: 1,
    rivalElement: 1,
    nfts: emptyNfts(),
    rivalHasNft: true,
    rivalNfts: 1,
    dstTakenToday: 0,
    rollCount: 0,
    strikes: 0,
    log: [],
    nextLogId: 1,
    dayKey,
    walkFaces: null,
    lastRivalFaces: null,
    enemyLuck: null,
    enemyShield: false,
    fightSettled: false,
    weaponReadout: null,
    landing: null,
  };
}

/** Buildings that still stand (level 1 or more) — the ones an attacker can hit. */
export function standingIndexes(levels: readonly number[]): number[] {
  return levels.flatMap((level, index) => (level > 0 ? [index] : []));
}

/** Whether raising this building next would restore a level an attacker knocked down. */
export function isRepair(state: Pick<GameState, "levels" | "best">, building: number): boolean {
  return (state.levels[building] ?? 0) < (state.best[building] ?? 0);
}

/** Money to raise this building one level (half for a knocked-down level), or null at level 5. */
export function upgradeCost(state: Pick<GameState, "levels" | "best" | "theme">, building: number): number | null {
  const level = state.levels[building];
  if (level === undefined) return null;
  const full = levelCost(level, state.theme);
  if (full === null) return null;
  return isRepair(state, building) ? repairCost(full) : full;
}

export function canUpgrade(state: GameState, building: number): boolean {
  const cost = upgradeCost(state, building);
  return cost !== null && state.points >= cost;
}

/** The cheapest next level anywhere in town, for the price badge on 🏗️; null when all are maxed. */
export function cheapestUpgrade(state: GameState): number | null {
  const costs = state.levels
    .map((_, building) => upgradeCost(state, building))
    .filter((cost): cost is number => cost !== null);
  return costs.length > 0 ? Math.min(...costs) : null;
}

function pushLog(state: GameState, tone: LogTone, text: string): GameState {
  const entry: LogEntry = { id: state.nextLogId, tone, text };
  return {
    ...state,
    nextLogId: state.nextLogId + 1,
    log: [entry, ...state.log].slice(0, 40),
  };
}

function isFace(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function readPair(value: unknown): DiePair | null {
  if (!Array.isArray(value) || value.length !== 2 || !isFace(value[0]) || !isFace(value[1])) {
    return null;
  }
  return [value[0], value[1]];
}

export function luckOf(dice: DiePair): number {
  return dice[0] + dice[1];
}

/** Levels read from a save; older saves (three buildings a town) are padded with empty plots. */
function readLevels(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length > length) return null;
  if (!value.every((level) => inRange(level, 0, MAX_LEVEL))) return null;
  return [...value, ...Array.from({ length: length - value.length }, () => 0)];
}

/** Nine crates for 偷嘢 (from the screen's dice); anything malformed falls back to a plain store. */
function readBoxes(value: unknown): StealBox[] {
  const fallback: StealBox[] = [
    { kind: "juice", amount: 2 },
    { kind: "meat", amount: 3 },
    { kind: "trap", amount: 1 },
    { kind: "juice", amount: 1 },
    { kind: "bomb", amount: 1 },
    { kind: "coins", amount: 6 },
    { kind: "meat", amount: 3 },
    { kind: "alarm", amount: 1 },
    { kind: "juice", amount: 2 },
  ];
  if (!Array.isArray(value) || value.length !== STEAL_CRATES) return fallback;
  const ok = value.every(
    (box) =>
      box &&
      typeof box === "object" &&
      ["juice", "meat", "coins", "dice", "jackpot", "trap", "bomb", "alarm"].includes(box.kind) &&
      inRange(box.amount, 1, 20),
  );
  return ok ? value.map((box) => ({ kind: box.kind, amount: box.amount })) : fallback;
}

const STEAL_NAMES: Record<StealKind, string> = { juice: "💎 水晶", meat: "🍖 肉", coins: "能量", dice: "骰仔", jackpot: "大寶箱", trap: "老鼠夾", bomb: "炸彈", alarm: "鬧鐘" };

/** Picks still to come on 偷嘢: three, less one for each crate opened and one more for each 鬧鐘. */
export function stealPicksLeft(state: Pick<GameState, "stealBoxes" | "stealOpened">): number {
  if (!state.stealBoxes) return 0;
  const alarms = state.stealOpened.filter((i) => state.stealBoxes![i]?.kind === "alarm").length;
  return Math.max(0, STEAL_PICKS - state.stealOpened.length - alarms);
}

/** The raid is over: no picks left, or the trap or the bomb went off. */
export function stealDone(state: Pick<GameState, "stealBoxes" | "stealOpened">): boolean {
  if (!state.stealBoxes) return true;
  return stealPicksLeft(state) <= 0 || state.stealOpened.some((i) => ["trap", "bomb"].includes(state.stealBoxes![i]?.kind));
}

/** What one crate adds (`times` = 1, or again for three of a kind). */
function gain(state: GameState, box: StealBox, times: number): Pick<GameState, "juice" | "meat" | "points" | "dice"> {
  const n = box.amount * times;
  return {
    juice: state.juice + (box.kind === "juice" ? n : box.kind === "jackpot" ? JACKPOT.juice * times : 0),
    meat: state.meat + (box.kind === "meat" ? n : 0),
    points: state.points + (box.kind === "coins" ? n : box.kind === "jackpot" ? JACKPOT.coins * times : 0),
    dice: box.kind === "dice" ? Math.min(DICE_CAP, state.dice + n) : state.dice,
  };
}

function readPet(value: unknown): Pet | null {
  if (!value || typeof value !== "object") return null;
  const pet = value as Partial<Pet>;
  // Saves from the five-element monsters (0–4) fold onto the three dragon attributes.
  if (!inRange(pet.element, 0, 9) || !inRange(pet.stage, 0, TOP_STAGE)) return null;
  return {
    element: pet.element % ELEMENTS.length,
    stage: pet.stage,
    hungry: inRange(pet.hungry, 0, 9) ? pet.hungry : 0,
    rolls: inRange(pet.rolls, 0, HATCH_ROLLS) ? pet.rolls : 0,
  };
}

function readNfts(value: unknown): (string | null)[] {
  const slots = emptyNfts();
  if (!Array.isArray(value)) return slots;
  return slots.map((_, index) => {
    const id = value[index];
    return typeof id === "string" && id.length > 0 && id.length <= 64 ? id : null;
  });
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function readWeapon(value: unknown): WeaponReadout | null {
  if (!value || typeof value !== "object") return null;
  const readout = value as Partial<WeaponReadout>;
  const { weapon, attackTotal, defenseTotal, enemyLuck, hit, pointsGained, shieldBreak } = readout;
  const chance = inRange(readout.chance, HIT_MIN, HIT_MAX) ? readout.chance : HIT_BASE;
  const smashed = inRange(readout.smashed, 0, BUILDINGS - 1) ? readout.smashed : null;
  const top = 10 + THEMES.length * THEME_ATTACK + BUILDINGS * MAX_LEVEL * LEVEL_ATTACK + NFT_SLOTS * NFT_ATTACK;
  if (
    !inRange(weapon, 0, BUILDINGS * MAX_LEVEL) ||
    !inRange(attackTotal, 10, top) ||
    !inRange(defenseTotal, 10, top) ||
    !inRange(enemyLuck, 2, 12) ||
    typeof hit !== "boolean" ||
    !inRange(pointsGained, 0, 6) ||
    typeof shieldBreak !== "boolean"
  ) {
    return null;
  }
  const edge = readout.edge === 1 || readout.edge === -1 ? readout.edge : 0;
  return { weapon, attackTotal, defenseTotal, chance, enemyLuck, hit, dst: 0, pointsGained, shieldBreak, smashed, edge };
}

export function sanitizeState(
  raw: unknown,
  now: number,
  dayKey: string,
): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<GameState> & { rivalStolenToday?: unknown };
  if (!inRange(value.position, 0, TILES.length - 1)) return null;
  const levels = readLevels(value.levels, BUILDINGS);
  const bestRead = readLevels(value.best, BUILDINGS);
  const rivalCity = inRange(value.rivalCity, 0, THEMES.length - 1) ? value.rivalCity : 0;
  const rivalLevels = readLevels(value.rivalLevels, BUILDINGS);
  if (!levels || !rivalLevels) return null;
  const best = levels.map((level, index) => Math.max(level, bestRead?.[index] ?? 0));
  const clampInt = (input: unknown, min: number, max: number, fallback: number) => {
    if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(input)));
  };
  const log = Array.isArray(value.log)
    ? value.log
        .filter(
          (entry): entry is LogEntry =>
            !!entry &&
            typeof entry === "object" &&
            typeof (entry as LogEntry).id === "number" &&
            typeof (entry as LogEntry).text === "string",
        )
        .map((entry) => ({ ...entry, tone: entry.tone === "you" ? "you" : "rule" }) as LogEntry)
        .slice(0, 40)
    : [];
  return {
    position: value.position,
    dice: clampInt(value.dice, 0, DICE_CAP, 0),
    lastRefillAt: typeof value.lastRefillAt === "number" ? value.lastRefillAt : now,
    points: clampInt(value.points, 0, 1_000_000, 0),
    pet: readPet(value.pet),
    meat: clampInt(value.meat, 0, 1_000_000, 0),
    juice: clampInt(value.juice, 0, 1_000_000, 0),
    stealBoxes: null,
    stealOpened: [],
    shopBought: [],
    theme: inRange(value.theme, 0, THEMES.length - 1) ? value.theme : 0,
    levels,
    best,
    rivalLevels,
    rivalCity,
    rivalFace: inRange(value.rivalFace, 0, CHARACTERS.length - 1) ? value.rivalFace : 1,
    rivalElement: inRange(value.rivalElement, 0, ELEMENTS.length - 1) ? value.rivalElement : 1,
    nfts: readNfts(value.nfts),
    rivalHasNft: value.rivalHasNft !== false,
    rivalNfts: value.rivalHasNft === false ? 0 : clampInt(value.rivalNfts, 1, NFT_SLOTS, 1),
    // DST is gone (能量 only); old saves' counts are dropped.
    dstTakenToday: 0,
    rollCount: clampInt(value.rollCount, 0, 1_000_000, 0),
    strikes: clampInt(value.strikes, 0, 1_000_000, 0),
    log,
    nextLogId: clampInt(value.nextLogId, 1, 1_000_000, 1),
    dayKey: typeof value.dayKey === "string" && value.dayKey ? value.dayKey : dayKey,
    walkFaces: readPair(value.walkFaces),
    lastRivalFaces: readPair(value.lastRivalFaces),
    enemyLuck: inRange(value.enemyLuck, 2, 12) ? value.enemyLuck : null,
    enemyShield: value.enemyShield === true,
    fightSettled: value.fightSettled === true,
    weaponReadout: readWeapon(value.weaponReadout),
    landing: null,
    phase: value.phase === "search" && inRange(value.enemyLuck, 2, 12) ? "search" : "walk",
  };
}

/** Which page list a save was made with (2 = the seaside pages, 希臘 first). */
export const SAVE_PAGES = 2;

export function parseSave(raw: string, now: number, dayKey: string): GameState | null {
  try {
    const parsed = JSON.parse(raw) as { v?: number; pages?: number; state?: unknown };
    if (parsed?.v !== 1) return null;
    // Saves from before the page list lost 工地小鎮 (the old first page): every page moved down one.
    if (parsed.pages !== SAVE_PAGES && parsed.state && typeof parsed.state === "object") {
      const old = parsed.state as { theme?: unknown; rivalCity?: unknown };
      if (typeof old.theme === "number" && old.theme > 0) old.theme -= 1;
      if (typeof old.rivalCity === "number" && old.rivalCity > 0) old.rivalCity -= 1;
    }
    return sanitizeState(parsed.state, now, dayKey);
  } catch {
    return null;
  }
}

/** Walk `roll` squares and apply what the square you stop on does. */
function landOn(
  from: number,
  roll: number,
  points: number,
  dice: number,
  chest: number,
  chestMeat = false,
  wheel = 0,
): { position: number; points: number; dice: number; meat: number; juice: number; landing: Landing } {
  const position = (from + roll) % TILES.length;
  const passedStart = from + roll >= TILES.length;
  const kind = TILES[position].kind;
  let change = passedStart ? POINTS.start : 0;
  let diceGained = 0;
  if (kind === "coin") change += POINTS.coin;
  let meat = kind === "meat" ? MEAT_PER_SQUARE : 0;
  if (kind === "chest" && chestMeat) meat += chest;
  else if (kind === "chest") change += chest;
  if (kind === "hole") change -= holeLoss(points + change);
  if (kind === "lucky" && dice < DICE_CAP) diceGained = 1;
  let juice = 0;
  if (kind === "wheel") {
    const prize = WHEEL_PRIZES[wheel] ?? WHEEL_PRIZES[0];
    change += prize.coins;
    meat += prize.meat;
    juice = prize.juice;
    diceGained = Math.max(0, Math.min(prize.dice, DICE_CAP - dice));
  }
  // Penalties sting a little but never push points below zero.
  const nextPoints = Math.max(0, points + change);
  return {
    position,
    points: nextPoints,
    dice: dice + diceGained,
    meat,
    juice,
    landing: { kind, points: nextPoints - points, dice: diceGained, meat, passedStart, ...(kind === "wheel" ? { wheel, juice } : {}) },
  };
}

function rollDay(state: GameState, now: number, dayKey: string): GameState {
  const player = applyRefill(state.dice, state.lastRefillAt, now);
  const dayChanged = dayKey !== state.dayKey;
  if (player.gained === 0 && !dayChanged) return state;

  let next: GameState = {
    ...state,
    dice: player.dice,
    lastRefillAt: player.lastRefillAt,
  };
  if (player.gained > 0) {
    next = pushLog(
      next,
      "rule",
      `3 分鐘到了，補上 ${player.gained} 顆。現在 ${player.dice}／20。骰子不出售。`,
    );
  }
  if (!dayChanged) return next;
  next = pushLog(
    { ...next, dayKey, dstTakenToday: 0 },
    "rule",
    "新的一天。",
  );
  // The monster eats once for each day gone by (at most a week's worth).
  if (!next.pet) return next;
  const days = Math.min(7, Math.max(1, daysBetween(state.dayKey, dayKey)));
  for (let day = 0; day < days; day++) {
    const pet = next.pet as Pet;
    const fed = eatForDay(pet, next.meat, next.juice);
    next = { ...next, pet: fed.pet, meat: fed.meat, juice: fed.juice };
    if (fed.dropped) next = pushLog(next, "rule", `${petName(pet)}餓咗兩日，跌返做${STAGE_NAMES[fed.pet.stage]}。`);
    else if (!fed.ate) next = pushLog(next, "rule", `${petName(pet)}今日冇嘢食，肚餓。再餓一日會跌階段。`);
  }
  return next;
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "hydrate": {
      const clean = sanitizeState(action.state, action.now, action.dayKey);
      if (!clean) return createGame(action.now, action.dayKey);
      return rollDay({ ...clean, phase: "walk" }, action.now, action.dayKey);
    }
    case "reset":
      return createGame(action.now, action.dayKey);
    case "tick":
      return rollDay(state, action.now, action.dayKey);
    case "add-test-die": {
      if (state.dice >= DICE_CAP) return state;
      return { ...state, dice: addTestDie(state.dice) };
    }
    case "place-nft": {
      if (!inRange(action.slot, 0, NFT_SLOTS - 1) || !action.id || state.nfts[action.slot] !== null) return state;
      if (state.nfts.includes(action.id)) return state;
      const nfts = state.nfts.map((id, index) => (index === action.slot ? action.id : id));
      return { ...state, nfts };
    }
    case "remove-nft": {
      if (!inRange(action.slot, 0, NFT_SLOTS - 1) || state.nfts[action.slot] === null) return state;
      const nfts = state.nfts.map((id, index) => (index === action.slot ? null : id));
      return { ...state, nfts };
    }
    case "set-rival-nft": {
      if (state.rivalHasNft === action.value) return state;
      // Before the first strike of a fight, the rival's shield follows their NFT.
      const fresh = state.phase === "search" && state.weaponReadout === null;
      return pushLog(
        {
          ...state,
          rivalHasNft: action.value,
          rivalNfts: action.value ? Math.max(1, state.rivalNfts) : 0,
          enemyShield: fresh ? action.value : state.enemyShield,
        },
        "rule",
        action.value
          ? "對手有 NFT，開打時有一面盾。"
          : "對手沒有 NFT，冇盾。",
      );
    }
    case "move": {
      const faces = readPair(action.faces);
      if (state.phase !== "walk" || !faces) return state;
      const steps = luckOf(faces);
      const spent = spendDice(state.dice, state.lastRefillAt, action.now, 1);
      if (!spent) return state;
      const chest = inRange(action.chest, CHEST_MIN, CHEST_MAX) ? action.chest : CHEST_DEFAULT;
      const wheel = inRange(action.wheel, 0, WHEEL_PRIZES.length - 1) ? action.wheel : 0;
      let moved = landOn(state.position, steps, state.points, spent.dice, chest, action.chestMeat === true, wheel);
      // 龍捲風 (Sky 2026-09-30, instead of jail): it picks you up and drops you on another square, which then
      // does its thing — a surprise, good or bad. The start bonus from the walk itself still counts.
      if (moved.landing.kind === "jail") {
        const to = inRange(action.tornado, 0, TILES.length - 1) && action.tornado !== moved.position
          ? action.tornado
          : (moved.position - 3 + TILES.length) % TILES.length;
        const blown = landOn(to, 0, moved.points, moved.dice, chest, action.chestMeat === true, wheel);
        moved = {
          ...blown,
          landing: { ...blown.landing, points: blown.points - state.points, passedStart: moved.landing.passedStart, tornado: true },
        };
      }
      const stealing = TILES[moved.position]?.kind === "steal";
      const shopping = TILES[moved.position]?.kind === "shop";
      const stealBoxes = stealing ? readBoxes(action.stealBoxes) : null;
      const tile = TILES[moved.position];
      const enemyFaces = tile?.kind === "attack" ? readPair(action.enemyDice) : null;
      const searching = enemyFaces !== null;
      const enemyLuck = searching ? luckOf(enemyFaces) : null;
      const rivalCity =
        searching && inRange(action.rivalCity, 0, THEMES.length - 1) ? action.rivalCity : state.rivalCity;
      const rivalFace =
        (searching || stealing) && inRange(action.rivalFace, 0, CHARACTERS.length - 1) ? action.rivalFace : state.rivalFace;
      const rivalElement =
        searching && inRange(action.rivalElement, 0, ELEMENTS.length - 1) ? action.rivalElement : state.rivalElement;
      // Five buildings on the rival's page, each 0–5; anything else falls back to what we had.
      const given = readLevels(action.rivalLevels, BUILDINGS);
      const rivalLevels = searching
        ? (given ?? Array.from({ length: BUILDINGS }, (_, index) => state.rivalLevels[index] ?? 0))
        : state.rivalLevels;
      // 龍巢: a free meal for your dragon (or a warm nest for the egg).
      const nesting = TILES[moved.position]?.kind === "start";
      const pet0 = state.pet;
      const [nestMeat, nestJuice] = !nesting
        ? [0, 0]
        : !pet0
          ? [NEST_NO_PET_MEAT, 0]
          : (NEST_FOOD[Math.max(0, Math.min(NEST_FOOD.length - 1, pet0.stage))] ?? [0, 0]);
      if (nesting) {
        moved = {
          ...moved,
          meat: moved.meat + nestMeat,
          juice: moved.juice + nestJuice,
          landing: { ...moved.landing, meat: moved.landing.meat + nestMeat, juice: (moved.landing.juice ?? 0) + nestJuice },
        };
      }
      const passed = moved.landing.passedStart ? "經過龍巢。" : "";
      const change = moved.landing.points;
      const effect = searching
        ? `搜尋敵人，配到${CHARACTERS[rivalFace].name}（${THEMES[rivalCity].name}），佢啲建築合共 ${totalLevels(rivalLevels)} 級。`
        : moved.landing.dice > 0
          ? "多一粒骰。"
          : nesting
            ? pet0 && pet0.stage === 0
              ? "龍巢暖住龍蛋，快啲孵。"
              : `龍巢免費餵食：${nestMeat} 🍖${nestJuice ? `、${nestJuice} 💎` : ""}。`
          : moved.meat > 0
            ? `攞到 ${moved.meat} 🍖。`
            : stealing
              ? "潛入敵人倉庫偷嘢。"
              : "";
      // A dragon egg counts board rolls and hatches by itself at the 60th.
      const egg = state.pet && state.pet.stage === 0 ? state.pet : null;
      const eggRolls = egg ? egg.rolls + 1 + (nesting ? NEST_EGG_ROLLS : 0) : 0;
      const nextPet: Pet | null = egg
        ? eggRolls >= HATCH_ROLLS
          ? { ...egg, stage: 1, rolls: HATCH_ROLLS, hungry: 0 }
          : { ...egg, rolls: eggRolls }
        : state.pet;
      const hatched = !!egg && nextPet?.stage === 1;
      const next: GameState = {
        ...state,
        phase: searching ? "search" : stealing ? "steal" : shopping ? "shop" : "walk",
        shopBought: [],
        dice: moved.dice,
        meat: state.meat + moved.meat,
        juice: state.juice + moved.juice,
        stealBoxes,
        stealOpened: [],
        lastRefillAt: spent.lastRefillAt,
        position: moved.position,
        points: moved.points,
        landing: moved.landing,
        rollCount: state.rollCount + 1,
        pet: nextPet,
        walkFaces: faces,
        lastRivalFaces: searching ? enemyFaces : null,
        rivalLevels,
        rivalCity,
        rivalFace,
        rivalElement,
        rivalNfts: state.rivalHasNft ? (inRange(action.rivalNfts, 1, NFT_SLOTS) ? action.rivalNfts : 1) : 0,
        enemyLuck,
        // Only a rival holding an NFT has a shield.
        enemyShield: searching && state.rivalHasNft,
        fightSettled: false,
        weaponReadout: null,
      };
      const walked = pushLog(
        next,
        "you",
        `你花 1 顆，擲出 ${faces[0]} 和 ${faces[1]}。走 ${steps} 格。${passed}走到${TILE_INFO[tile.kind].icon}${tile.name}。能量 ${change >= 0 ? "+" : "−"}${formatEnergy(Math.abs(coinEnergy(change)))}，合計 ${formatEnergy(coinEnergy(next.points))}。${effect}`,
      );
      return hatched && nextPet ? pushLog(walked, "rule", `龍蛋孵化咗！係一隻${ELEMENTS[nextPet.element].beast}。`) : walked;
    }
    case "weapon": {
      if (state.phase !== "search" || state.enemyLuck === null || state.fightSettled) return state;
      // One tap settles the fight: the attacker picks a standing building (if any), and a hit
      // breaks the shield on the way through before knocking that building down a level.
      const standing = standingIndexes(state.rivalLevels);
      const target = action.target ?? null;
      if (standing.length > 0 && (target === null || !standing.includes(target))) {
        return state;
      }
      const weapon = totalLevels(state.levels);
      const attackTotal = attackPower(state);
      const defenseTotal = rivalPower(state);
      // Attribute match-up (only once your dragon has hatched): ±10 points on the hit chance.
      const edge = matchUp(state);
      const chance = Math.max(HIT_MIN, Math.min(HIT_MAX, hitChance(attackTotal, defenseTotal) + edge * TYPE_EDGE));
      const roll = typeof action.roll === "number" && action.roll >= 0 && action.roll < 1 ? action.roll : 0.5;
      const hit = roll * 100 < chance;
        let pointsGained = 0;
        let smashed: number | null = null;
      const shieldBreak = hit && state.enemyShield;
      if (hit) {
        const smash = smashPoints(attackTotal, defenseTotal);
        // Breaking a shield adds 1 more.
        pointsGained = smash + (shieldBreak ? 1 : 0);
        if (standing.length > 0) smashed = target;
      }
      const enemyShield = state.enemyShield && !hit;
      const fightSettled = true;
      const rivalLevels =
        smashed === null
          ? state.rivalLevels
          : state.rivalLevels.map((level, index) => (index === smashed ? level - 1 : level));
      const weaponReadout: WeaponReadout = {
        weapon,
        attackTotal,
        defenseTotal,
        chance,
        enemyLuck: state.enemyLuck,
        hit,
        dst: 0,
        pointsGained,
        shieldBreak,
        smashed,
        edge,
      };
      const verdict = shieldBreak ? "盾破，打中" : hit ? "打中" : "打唔中";
        const smashText = smashed === null ? "" : `打低咗${CHARACTERS[state.rivalFace].name}嘅${LANDMARK_NAMES[smashed]}一級。`;
      const nextPoints = state.points + pointsGained;
      return pushLog(
        {
          ...state,
          points: nextPoints,
          strikes: state.strikes + 1,
          rivalLevels,
          enemyShield,
          fightSettled,
          weaponReadout,
        },
        "you",
        `總攻擊 ${attackTotal}，總防守 ${defenseTotal}，${edge > 0 ? "屬性克制，" : edge < 0 ? "屬性被克，" : ""}機會 ${chance}%。${verdict}。${smashText}得 ${formatEnergy(coinEnergy(pointsGained))} 能量，合計 ${formatEnergy(coinEnergy(nextPoints))}。`,
      );
    }
    case "ad-double": {
      const l = state.landing;
      if (!l || l.doubled || !canDouble(l)) return state;
      const points = Math.max(0, l.points - (l.passedStart ? POINTS.start : 0));
      return {
        ...state,
        points: state.points + points,
        dice: Math.min(DICE_CAP, state.dice + l.dice),
        meat: state.meat + l.meat,
        juice: state.juice + (l.juice ?? 0),
        landing: { ...l, doubled: true, points: l.points + points, dice: l.dice * 2, meat: l.meat * 2, juice: (l.juice ?? 0) * 2 },
      };
    }
    case "return-walk": {
      if (state.phase === "steal") return { ...state, phase: "walk", stealBoxes: null, stealOpened: [] };
      if (state.phase === "shop") return { ...state, phase: "walk", shopBought: [] };
      if (state.phase !== "search") return state;
      return { ...state, phase: "walk" };
    }
    case "shop-buy": {
      if (state.phase !== "shop" || state.shopBought.includes(action.index)) return state;
      const offer = shopOffers(state.dayKey)[action.index];
      if (!offer || state.points < offer.price || (offer.item === "dice" && state.dice >= DICE_CAP)) return state;
      return {
        ...state,
        points: state.points - offer.price,
        dice: offer.item === "dice" ? Math.min(DICE_CAP, state.dice + offer.amount) : state.dice,
        meat: offer.item === "meat" ? state.meat + offer.amount : state.meat,
        juice: offer.item === "juice" ? state.juice + offer.amount : state.juice,
        shopBought: [...state.shopBought, action.index],
      };
    }
    case "steal-pick": {
      if (state.phase !== "steal" || !state.stealBoxes || stealDone(state)) return state;
      const box = state.stealBoxes[action.index];
      if (!box || state.stealOpened.includes(action.index)) return state;
      const opened = [...state.stealOpened, action.index];
      if (box.kind === "bomb") {
        // 炸彈: everything taken on this raid is blown away, and the raid ends.
        let lost: GameState = { ...state, stealOpened: opened };
        for (const i of state.stealOpened) {
          const took = state.stealBoxes[i];
          const back = gain({ ...lost, juice: 0, meat: 0, points: 0, dice: 0 }, took, 1);
          lost = {
            ...lost,
            juice: Math.max(0, lost.juice - back.juice),
            meat: Math.max(0, lost.meat - back.meat),
            points: Math.max(0, lost.points - back.points),
            dice: Math.max(0, lost.dice - back.dice),
          };
        }
        return pushLog(lost, "you", "中咗炸彈！偷到嘅嘢全部炸冇咗。");
      }
      let next: GameState = { ...state, stealOpened: opened, ...gain(state, box, 1) };
      // Three of a kind: the whole haul again.
      const three = opened.length === STEAL_PICKS ? opened.map((i) => state.stealBoxes![i]) : null;
      const triple = !!three && three.every((b) => b.kind === three[0].kind && !STEAL_DANGERS.includes(b.kind));
      if (triple) for (const b of three!) next = { ...next, ...gain(next, b, 1) };
      const what = box.kind === "coins" ? `${formatEnergy(coinEnergy(box.amount))} 能量` : STEAL_NAMES[box.kind];
      const text =
        box.kind === "trap"
          ? "中咗老鼠夾！今次偷嘢完。"
          : box.kind === "alarm"
            ? "鬧鐘響！少咗一次機會。"
            : `偷到 ${what}。${triple ? "三個一樣，雙倍！" : ""}`;
      return pushLog(next, "you", text);
    }
    case "pick-pet": {
      if (state.pet || !inRange(action.element, 0, ELEMENTS.length - 1)) return state;
      return pushLog({ ...state, pet: { element: action.element, stage: 0, hungry: 0, rolls: 0 } }, "you", `你領咗一隻龍蛋（${ELEMENTS[action.element].name}屬性）。`);
    }
    case "grow-pet": {
      const pet = state.pet;
      const need = pet ? growNeed(pet) : null;
      if (!pet || !need || state.meat < need[0] || state.juice < need[1]) return state;
      const grown: Pet = { ...pet, stage: pet.stage + 1, hungry: 0 };
      return pushLog(
        { ...state, pet: grown, meat: state.meat - need[0], juice: state.juice - need[1] },
        "you",
        `餵咗 ${need[0]} 🍖 同 ${need[1]} 💎，${petName(pet)}長大做${STAGE_NAMES[grown.stage]}！`,
      );
    }
    case "upgrade": {
      const building = action.building;
      const cost = upgradeCost(state, building);
      if (!inRange(building, 0, BUILDINGS - 1) || cost === null || state.points < cost) return state;
      const repairing = isRepair(state, building);
      const levels = state.levels.map((level, index) => (index === building ? level + 1 : level));
      const best = state.best.map((top, index) => Math.max(top, levels[index]));
      const next: GameState = { ...state, levels, best, points: state.points - cost };
      const logged = pushLog(
        next,
        "you",
        `你花 ${formatEnergy(coinEnergy(cost))} 能量，${repairing ? "修返" : "升咗"}${LANDMARK_NAMES[building]}，而家第 ${levels[building]} 級。能量剩 ${formatEnergy(coinEnergy(next.points))}。`,
      );
      if (!pageDone(levels)) return logged;
      // Page finished: it is locked for good, a reward is paid, and the next theme opens (empty).
      const coins = themeRewardCoins(state.theme);
      const last = state.theme >= THEMES.length - 1;
      const rewarded: GameState = {
        ...logged,
        points: logged.points + coins,
        dice: Math.max(logged.dice, Math.min(DICE_CAP, logged.dice + THEME_REWARD_DICE)),
        ...(last ? {} : { theme: state.theme + 1, levels: noLevels(), best: noLevels() }),
      };
      return pushLog(
        rewarded,
        "rule",
        `完成咗「${THEMES[state.theme].name}」！送 ${formatEnergy(coinEnergy(coins))} 能量同 ${THEME_REWARD_DICE} 粒骰。${last ? "所有主題都完成咗。" : `下一頁：「${THEMES[state.theme + 1].name}」。`}`,
      );
    }
    case "raided": {
      // Another player's hit knocks one of your standing buildings down a level.
      // A finished page is locked: nobody can knock it down.
      if (!inRange(action.target, 0, BUILDINGS - 1) || state.levels[action.target] < 1 || pageDone(state.levels)) return state;
      const levels = state.levels.map((level, index) => (index === action.target ? level - 1 : level));
      // Being hit earns nothing; the loss is the repair bill (half price back to the old level).
      return pushLog(
        { ...state, levels },
        "rule",
        `有人攻擊你，${LANDMARK_NAMES[action.target]}跌咗一級。被打冇錢，修返要半價。`,
      );
    }
    default:
      return state;
  }
}
