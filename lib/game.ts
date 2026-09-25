import { LANDMARK_NAMES, TILES } from "./board";
import {
  DAILY_DST_CAP,
  DICE_CAP,
  POINTS,
  addTestDie,
  applyRefill,
  buildCost,
  spendDice,
} from "./rules";

export type Landmark = "empty" | "built";

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
  enemyLuck: number;
  hit: boolean;
  dst: number;
  pointsGained: number;
  shieldBreak: boolean;
};

export type GameState = {
  phase: Phase;
  position: number;
  dice: number;
  lastRefillAt: number;
  points: number;
  landmarks: Landmark[];
  rivalLandmarks: Landmark[];
  hasNft: boolean;
  rivalHasNft: boolean;
  /** DST this player has taken today. Capped at 5 per day. */
  dstTakenToday: number;
  rollCount: number;
  log: LogEntry[];
  nextLogId: number;
  dayKey: string;
  walkFace: number | null;
  lastRivalFaces: DiePair | null;
  enemyLuck: number | null;
  enemyShield: boolean;
  fightSettled: boolean;
  weaponReadout: WeaponReadout | null;
};

export type Action =
  | { type: "tick"; now: number; dayKey: string }
  | { type: "add-test-die" }
  | { type: "move"; face: number; enemyDice?: DiePair | null; now: number }
  | { type: "weapon" }
  | { type: "return-walk" }
  | { type: "build" }
  | { type: "set-nft"; value: boolean }
  | { type: "set-rival-nft"; value: boolean }
  | { type: "reset"; now: number; dayKey: string }
  | { type: "hydrate"; state: GameState; now: number; dayKey: string };

export const STORAGE_KEY = "dafuweng-daily-board-v3";
export const STARTING_DICE = 2;

const emptyLandmarks = (): Landmark[] => ["empty", "empty", "empty", "empty"];

export function createGame(now: number, dayKey: string): GameState {
  return {
    phase: "walk",
    position: 0,
    dice: STARTING_DICE,
    lastRefillAt: now,
    points: 0,
    landmarks: emptyLandmarks(),
    rivalLandmarks: ["built", "built", "empty", "empty"],
    hasNft: true,
    rivalHasNft: true,
    dstTakenToday: 0,
    rollCount: 0,
    log: [],
    nextLogId: 1,
    dayKey,
    walkFace: null,
    lastRivalFaces: null,
    enemyLuck: null,
    enemyShield: false,
    fightSettled: false,
    weaponReadout: null,
  };
}

export function countBuilt(landmarks: readonly Landmark[]): number {
  return landmarks.filter((landmark) => landmark === "built").length;
}

/** Which landmark the next build raises: the one under you, else the first open one. */
export function raiseTarget(state: GameState): number | null {
  const here = TILES[state.position];
  if (here && here.landmarkIndex !== null && state.landmarks[here.landmarkIndex] !== "built") {
    return here.landmarkIndex;
  }
  const open = state.landmarks.findIndex((landmark) => landmark !== "built");
  return open === -1 ? null : open;
}

/** Points needed for the next landmark, or null when all four stand. */
export function nextBuildCost(state: GameState): number | null {
  return buildCost(countBuilt(state.landmarks));
}

export function canBuild(state: GameState): boolean {
  const cost = nextBuildCost(state);
  return cost !== null && raiseTarget(state) !== null && state.points >= cost;
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

/** Older saves may hold "ruined"; the current rules have no smashing, so it reads as empty. */
function readLandmarks(value: unknown): Landmark[] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((item) => item === "empty" || item === "built" || item === "ruined")) {
    return null;
  }
  return value.map((item) => (item === "built" ? "built" : "empty"));
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function readWeapon(value: unknown): WeaponReadout | null {
  if (!value || typeof value !== "object") return null;
  const readout = value as Partial<WeaponReadout>;
  const { weapon, attackTotal, defenseTotal, enemyLuck, hit, dst, pointsGained, shieldBreak } = readout;
  if (
    !inRange(weapon, 0, 4) ||
    !inRange(attackTotal, 10, 30) ||
    !inRange(defenseTotal, 2, 32) ||
    !inRange(enemyLuck, 2, 12) ||
    typeof hit !== "boolean" ||
    !inRange(dst, 0, DAILY_DST_CAP) ||
    !inRange(pointsGained, 0, 5) ||
    typeof shieldBreak !== "boolean"
  ) {
    return null;
  }
  return { weapon, attackTotal, defenseTotal, enemyLuck, hit, dst, pointsGained, shieldBreak };
}

export function sanitizeState(
  raw: unknown,
  now: number,
  dayKey: string,
): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<GameState> & { rivalStolenToday?: unknown };
  if (!inRange(value.position, 0, TILES.length - 1)) return null;
  const landmarks = readLandmarks(value.landmarks);
  const rivalLandmarks = readLandmarks(value.rivalLandmarks);
  if (!landmarks || !rivalLandmarks) return null;
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
    landmarks,
    rivalLandmarks,
    hasNft: value.hasNft === true,
    rivalHasNft: value.rivalHasNft !== false,
    // Saves from before the rename kept this under rivalStolenToday.
    dstTakenToday: clampInt(value.dstTakenToday ?? value.rivalStolenToday, 0, DAILY_DST_CAP, 0),
    rollCount: clampInt(value.rollCount, 0, 1_000_000, 0),
    log,
    nextLogId: clampInt(value.nextLogId, 1, 1_000_000, 1),
    dayKey: typeof value.dayKey === "string" && value.dayKey ? value.dayKey : dayKey,
    walkFace: inRange(value.walkFace, 1, 6) ? value.walkFace : null,
    lastRivalFaces: readPair(value.lastRivalFaces),
    enemyLuck: inRange(value.enemyLuck, 2, 12) ? value.enemyLuck : null,
    enemyShield: value.enemyShield === true,
    fightSettled: value.fightSettled === true,
    weaponReadout: readWeapon(value.weaponReadout),
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

function movePoints(from: number, roll: number): {
  position: number;
  gained: number;
  passedStart: boolean;
} {
  const position = (from + roll) % TILES.length;
  const passedStart = from + roll >= TILES.length;
  const tile = TILES[position];
  let gained = 0;
  if (passedStart) gained += POINTS.start;
  if (tile.kind !== "start") gained += POINTS.land;
  return { position, gained, passedStart };
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
      `30 分鐘到了，補上 ${player.gained} 顆。現在 ${player.dice}／20。骰子不出售。`,
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
    case "set-nft": {
      if (state.hasNft === action.value) return state;
      return pushLog(
        { ...state, hasNft: action.value },
        "rule",
        action.value
          ? "你有 NFT。對手也有 NFT 時，打中才搬 DST，一日最多 5。"
          : "你沒有 NFT。這一戰只計分數，DST 0。",
      );
    }
    case "set-rival-nft": {
      if (state.rivalHasNft === action.value) return state;
      return pushLog(
        { ...state, rivalHasNft: action.value },
        "rule",
        action.value
          ? "對手有 NFT。你也有 NFT 時，打中才搬 DST，一日最多 5。"
          : "對手沒有 NFT。這一戰只計分數，DST 0。",
      );
    }
    case "move": {
      const face = action.face;
      if (state.phase !== "walk" || !isFace(face)) return state;
      const spent = spendDice(state.dice, state.lastRefillAt, action.now, 1);
      if (!spent) return state;
      const moved = movePoints(state.position, face);
      const tile = TILES[moved.position];
      const enemyFaces = tile?.kind === "attack" ? readPair(action.enemyDice) : null;
      const searching = enemyFaces !== null;
      const enemyLuck = searching ? luckOf(enemyFaces) : null;
      const passed = moved.passedStart ? "經過起點。" : "";
      const searchText = searching
        ? `這格是攻擊。搜尋敵人，配到阿強。敵人擲出 ${enemyFaces[0]} 和 ${enemyFaces[1]}。幸運值 ${enemyLuck}。`
        : "這格只加分數。";
      const next: GameState = {
        ...state,
        phase: searching ? "search" : "walk",
        dice: spent.dice,
        lastRefillAt: spent.lastRefillAt,
        position: moved.position,
        points: state.points + moved.gained,
        rollCount: state.rollCount + 1,
        walkFace: face,
        lastRivalFaces: searching ? enemyFaces : null,
        enemyLuck,
        enemyShield: searching,
        fightSettled: false,
        weaponReadout: null,
      };
      return pushLog(
        next,
        "you",
        `你花 1 顆，擲出 ${face}。走 ${face} 格。${passed}走到${tile?.name ?? "這一格"}。分數 +${moved.gained}，合計 ${next.points}。${searchText}`,
      );
    }
    case "weapon": {
      if (state.phase !== "search" || state.enemyLuck === null || state.fightSettled) return state;
      const weapon = countBuilt(state.landmarks);
      const attackTotal = 10 + weapon * 5;
      const defenseTotal = countBuilt(state.rivalLandmarks) * 5 + state.enemyLuck;
      const hit = attackTotal > defenseTotal;
      const bothNft = state.hasNft && state.rivalHasNft;
      let pointsGained = 0;
      let dst = 0;
      let shieldBreak = false;
      let enemyShield = state.enemyShield;
      let fightSettled = true;
      if (hit && state.enemyShield) {
        pointsGained = 1;
        shieldBreak = true;
        enemyShield = false;
        fightSettled = false;
      } else if (hit) {
        pointsGained = Math.min(5, Math.max(1, attackTotal - defenseTotal));
        const room = Math.max(0, DAILY_DST_CAP - state.dstTakenToday);
        dst = bothNft ? Math.min(pointsGained, room) : 0;
      }
      const weaponReadout: WeaponReadout = {
        weapon,
        attackTotal,
        defenseTotal,
        enemyLuck: state.enemyLuck,
        hit,
        dst,
        pointsGained,
        shieldBreak,
      };
      const verdict = shieldBreak ? "盾破" : hit ? "打中" : "打唔中";
      const pay = dst > 0 ? `搬走 ${dst} DST。` : "DST 0。";
      const nextPoints = state.points + pointsGained;
      return pushLog(
        {
          ...state,
          points: nextPoints,
          dstTakenToday: state.dstTakenToday + dst,
          enemyShield,
          fightSettled,
          weaponReadout,
        },
        "you",
        `總攻擊 ${attackTotal}，總防守 ${defenseTotal}。${verdict}。得 ${pointsGained} 分，合計 ${nextPoints}。${pay}`,
      );
    }
    case "return-walk": {
      if (state.phase !== "search") return state;
      return { ...state, phase: "walk" };
    }
    case "build": {
      const index = raiseTarget(state);
      const cost = nextBuildCost(state);
      if (index === null || cost === null || state.points < cost) return state;
      const landmarks = state.landmarks.map((item, itemIndex) =>
        itemIndex === index ? ("built" as const) : item,
      );
      const next: GameState = { ...state, landmarks, points: state.points - cost };
      return pushLog(
        next,
        "you",
        `你花 ${cost} 分，起了${LANDMARK_NAMES[index]}。武器變成 ${countBuilt(landmarks)}。分數剩 ${next.points}。`,
      );
    }
    default:
      return state;
  }
}
