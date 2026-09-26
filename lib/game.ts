import { LANDMARK_NAMES, TILES, TILE_INFO, type TileKind } from "./board";
import { CITIES, plotCount } from "./cities";
import {
  CHEST_DEFAULT,
  CHEST_MAX,
  CHEST_MIN,
  DAILY_DST_CAP,
  DICE_CAP,
  HIT_BASE,
  HIT_MAX,
  HIT_MIN,
  NFT_ATTACK,
  NFT_SLOTS,
  BUILDINGS,
  LEVEL_ATTACK,
  MAX_LEVEL,
  POINTS,
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

export type Phase = "walk" | "search";

export type WeaponReadout = {
  weapon: number;
  attackTotal: number;
  defenseTotal: number;
  /** Chance the strike had to land, 15–85. */
  chance: number;
  enemyLuck: number;
  hit: boolean;
  dst: number;
  pointsGained: number;
  shieldBreak: boolean;
  /** The rival building this attack knocked down a level, if any. */
  smashed: number | null;
};

/** What the last stop did, for the picture shown on the board. */
export type Landing = {
  kind: TileKind;
  /** Points actually gained (negative for jail or tax), start bonus included. */
  points: number;
  /** Dice gained. */
  dice: number;
  passedStart: boolean;
};

export type GameState = {
  phase: Phase;
  position: number;
  dice: number;
  lastRefillAt: number;
  points: number;
  /** Your three buildings' levels, 0 (empty plot) to 5. */
  levels: number[];
  /** The highest level each building has reached; levels below it are repairs at half price. */
  best: number[];
  /** The current rival's building levels, one per plot in their city. */
  rivalLevels: number[];
  /** Which of CITIES the current rival lives in. */
  rivalCity: number;
  /** The five NFT slots: each holds an NFT id or is empty. Any NFT placed means you hold one. */
  nfts: (string | null)[];
  rivalHasNft: boolean;
  /** How many NFTs the current rival has placed (0 without an NFT). */
  rivalNfts: number;
  /** DST this player has taken today. Capped at 5 per day. */
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
      /** The levels of the rival met on an 攻擊 square, one per plot in their city (0–5). */
      rivalLevels?: number[];
      /** Which of CITIES that rival lives in. */
      rivalCity?: number;
      /** How many NFTs that rival has placed (1–5), when they hold any. */
      rivalNfts?: number;
      /** Points in the chest, if the walk stops on 寶箱 (3–6). */
      chest?: number;
      now: number;
    }
  | { type: "weapon"; target?: number | null; /** A random number in [0, 1) deciding the hit. */ roll?: number }
  | { type: "raided"; target: number }
  | { type: "upgrade"; building: number }
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

/** Placing any NFT counts as holding one: that unlocks DST and the shield. */
export function holdsNft(state: Pick<GameState, "nfts">): boolean {
  return nftCount(state) > 0;
}

/** All standing levels added up, 0–15 for a full town. */
export function totalLevels(levels: readonly number[]): number {
  return levels.reduce((sum, level) => sum + level, 0);
}

/** The rival's power, on the same scale as yours: 10, +2 per standing level, +2 per NFT. */
export function rivalPower(state: Pick<GameState, "rivalLevels" | "rivalNfts">): number {
  return 10 + totalLevels(state.rivalLevels) * LEVEL_ATTACK + nftAttack(state.rivalNfts);
}

/** Attack power: 10, +2 per standing level, plus +2 per NFT placed. */
export function attackPower(state: Pick<GameState, "levels" | "nfts">): number {
  return 10 + totalLevels(state.levels) * LEVEL_ATTACK + nftAttack(nftCount(state));
}

export function createGame(now: number, dayKey: string): GameState {
  return {
    phase: "walk",
    position: 0,
    dice: STARTING_DICE,
    lastRefillAt: now,
    points: 0,
    levels: noLevels(),
    best: noLevels(),
    rivalLevels: [2, 1, 0],
    rivalCity: 0,
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
export function upgradeCost(state: Pick<GameState, "levels" | "best">, building: number): number | null {
  const level = state.levels[building];
  if (level === undefined) return null;
  const full = levelCost(level);
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

function readLevels(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  if (!value.every((level) => inRange(level, 0, MAX_LEVEL))) return null;
  return [...value];
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
  const { weapon, attackTotal, defenseTotal, enemyLuck, hit, dst, pointsGained, shieldBreak } = readout;
  const chance = inRange(readout.chance, HIT_MIN, HIT_MAX) ? readout.chance : HIT_BASE;
  const smashed = inRange(readout.smashed, 0, BUILDINGS - 1) ? readout.smashed : null;
  const top = 10 + BUILDINGS * MAX_LEVEL * LEVEL_ATTACK + NFT_SLOTS * NFT_ATTACK;
  if (
    !inRange(weapon, 0, BUILDINGS * MAX_LEVEL) ||
    !inRange(attackTotal, 10, top) ||
    !inRange(defenseTotal, 10, top) ||
    !inRange(enemyLuck, 2, 12) ||
    typeof hit !== "boolean" ||
    !inRange(dst, 0, DAILY_DST_CAP) ||
    !inRange(pointsGained, 0, 6) ||
    typeof shieldBreak !== "boolean"
  ) {
    return null;
  }
  return { weapon, attackTotal, defenseTotal, chance, enemyLuck, hit, dst, pointsGained, shieldBreak, smashed };
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
  const rivalCity = inRange(value.rivalCity, 0, CITIES.length - 1) ? value.rivalCity : 0;
  const rivalLevels = readLevels(value.rivalLevels, plotCount(rivalCity));
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
    levels,
    best,
    rivalLevels,
    rivalCity,
    nfts: readNfts(value.nfts),
    rivalHasNft: value.rivalHasNft !== false,
    rivalNfts: value.rivalHasNft === false ? 0 : clampInt(value.rivalNfts, 1, NFT_SLOTS, 1),
    // Saves from before the rename kept this under rivalStolenToday.
    dstTakenToday: clampInt(value.dstTakenToday ?? value.rivalStolenToday, 0, DAILY_DST_CAP, 0),
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

export function parseSave(raw: string, now: number, dayKey: string): GameState | null {
  try {
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown };
    if (parsed?.v !== 1) return null;
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
): { position: number; points: number; dice: number; landing: Landing } {
  const position = (from + roll) % TILES.length;
  const passedStart = from + roll >= TILES.length;
  const kind = TILES[position].kind;
  let change = passedStart ? POINTS.start : 0;
  let diceGained = 0;
  if (kind === "coin") change += POINTS.coin;
  if (kind === "chest") change += chest;
  if (kind === "jail") change += POINTS.jail;
  if (kind === "tax") change += POINTS.tax;
  if (kind === "lucky" && dice < DICE_CAP) diceGained = 1;
  // Penalties sting a little but never push points below zero.
  const nextPoints = Math.max(0, points + change);
  return {
    position,
    points: nextPoints,
    dice: dice + diceGained,
    landing: { kind, points: nextPoints - points, dice: diceGained, passedStart },
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
  return pushLog(
    { ...next, dayKey, dstTakenToday: 0 },
    "rule",
    "新的一天。今日搬走的 DST 從 0 再算，一日最多 5。",
  );
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
          ? "對手有 NFT，開打時有一面盾。你也有 NFT 時，打中才搬 DST，一日最多 5。"
          : "對手沒有 NFT，冇盾。這一戰只計分數，DST 0。",
      );
    }
    case "move": {
      const faces = readPair(action.faces);
      if (state.phase !== "walk" || !faces) return state;
      const steps = luckOf(faces);
      const spent = spendDice(state.dice, state.lastRefillAt, action.now, 1);
      if (!spent) return state;
      const chest = inRange(action.chest, CHEST_MIN, CHEST_MAX) ? action.chest : CHEST_DEFAULT;
      const moved = landOn(state.position, steps, state.points, spent.dice, chest);
      const tile = TILES[moved.position];
      const enemyFaces = tile?.kind === "attack" ? readPair(action.enemyDice) : null;
      const searching = enemyFaces !== null;
      const enemyLuck = searching ? luckOf(enemyFaces) : null;
      const rivalCity =
        searching && inRange(action.rivalCity, 0, CITIES.length - 1) ? action.rivalCity : state.rivalCity;
      // One building per plot in the rival's city, each 0–5; anything else falls back to what we had.
      const plots = plotCount(rivalCity);
      const given = readLevels(action.rivalLevels, plots);
      const rivalLevels = searching
        ? (given ?? Array.from({ length: plots }, (_, index) => state.rivalLevels[index] ?? 0))
        : state.rivalLevels;
      const passed = moved.landing.passedStart ? "經過起點。" : "";
      const change = moved.landing.points;
      const effect = searching
        ? `搜尋敵人，配到${CITIES[rivalCity].rival.name}，佢啲建築合共 ${totalLevels(rivalLevels)} 級。`
        : moved.landing.dice > 0
          ? "多一粒骰。"
          : "";
      const next: GameState = {
        ...state,
        phase: searching ? "search" : "walk",
        dice: moved.dice,
        lastRefillAt: spent.lastRefillAt,
        position: moved.position,
        points: moved.points,
        landing: moved.landing,
        rollCount: state.rollCount + 1,
        walkFaces: faces,
        lastRivalFaces: searching ? enemyFaces : null,
        rivalLevels,
        rivalCity,
        rivalNfts: state.rivalHasNft ? (inRange(action.rivalNfts, 1, NFT_SLOTS) ? action.rivalNfts : 1) : 0,
        enemyLuck,
        // Only a rival holding an NFT has a shield.
        enemyShield: searching && state.rivalHasNft,
        fightSettled: false,
        weaponReadout: null,
      };
      return pushLog(
        next,
        "you",
        `你花 1 顆，擲出 ${faces[0]} 和 ${faces[1]}。走 ${steps} 格。${passed}走到${TILE_INFO[tile.kind].icon}${tile.name}。分數 ${change >= 0 ? "+" : ""}${change}，合計 ${next.points}。${effect}`,
      );
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
      const chance = hitChance(attackTotal, defenseTotal);
      const roll = typeof action.roll === "number" && action.roll >= 0 && action.roll < 1 ? action.roll : 0.5;
      const hit = roll * 100 < chance;
      const bothNft = holdsNft(state) && state.rivalHasNft;
      let pointsGained = 0;
      let dst = 0;
      let smashed: number | null = null;
      const shieldBreak = hit && state.enemyShield;
      if (hit) {
        const smash = smashPoints(attackTotal, defenseTotal);
        // Breaking a shield adds 1 point; DST only follows the smash itself.
        pointsGained = smash + (shieldBreak ? 1 : 0);
        const room = Math.max(0, DAILY_DST_CAP - state.dstTakenToday);
        dst = bothNft ? Math.min(smash, room) : 0;
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
        dst,
        pointsGained,
        shieldBreak,
        smashed,
      };
      const verdict = shieldBreak ? "盾破，打中" : hit ? "打中" : "打唔中";
      const pay = dst > 0 ? `搬走 ${dst} DST。` : "DST 0。";
      const smashText = smashed === null ? "" : `打低咗${CITIES[state.rivalCity].rival.name}嘅${LANDMARK_NAMES[smashed]}一級。`;
      const nextPoints = state.points + pointsGained;
      return pushLog(
        {
          ...state,
          points: nextPoints,
          dstTakenToday: state.dstTakenToday + dst,
          strikes: state.strikes + 1,
          rivalLevels,
          enemyShield,
          fightSettled,
          weaponReadout,
        },
        "you",
        `總攻擊 ${attackTotal}，總防守 ${defenseTotal}，機會 ${chance}%。${verdict}。${smashText}得 ${pointsGained} 分，合計 ${nextPoints}。${pay}`,
      );
    }
    case "return-walk": {
      if (state.phase !== "search") return state;
      return { ...state, phase: "walk" };
    }
    case "upgrade": {
      const building = action.building;
      const cost = upgradeCost(state, building);
      if (!inRange(building, 0, BUILDINGS - 1) || cost === null || state.points < cost) return state;
      const repairing = isRepair(state, building);
      const levels = state.levels.map((level, index) => (index === building ? level + 1 : level));
      const best = state.best.map((top, index) => Math.max(top, levels[index]));
      const next: GameState = { ...state, levels, best, points: state.points - cost };
      return pushLog(
        next,
        "you",
        `你花 ${cost} 金幣，${repairing ? "修返" : "升咗"}${LANDMARK_NAMES[building]}，而家第 ${levels[building]} 級。金幣剩 ${next.points}。`,
      );
    }
    case "raided": {
      // Another player's hit knocks one of your standing buildings down a level.
      if (!inRange(action.target, 0, BUILDINGS - 1) || state.levels[action.target] < 1) return state;
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
