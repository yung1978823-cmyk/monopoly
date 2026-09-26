import { LANDMARK_NAMES, TILES } from "./board";
import { CITIES, plotCount } from "./cities";
import {
  DAILY_DST_CAP,
  DICE_CAP,
  POINTS,
  addTestDie,
  applyRefill,
  buildCost,
  repairCost,
  spendDice,
} from "./rules";

/** A landmark slot: never built, standing, or smashed by an attacker and waiting for repair. */
export type Landmark = "empty" | "built" | "ruined";

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
  /** The rival landmark this attack smashed, if any. */
  smashed: number | null;
};

export type GameState = {
  phase: Phase;
  position: number;
  dice: number;
  lastRefillAt: number;
  points: number;
  landmarks: Landmark[];
  rivalLandmarks: Landmark[];
  /** Which of CITIES the current rival lives in. */
  rivalCity: number;
  hasNft: boolean;
  rivalHasNft: boolean;
  /** DST this player has taken today. Capped at 5 per day. */
  dstTakenToday: number;
  rollCount: number;
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
};

export type Action =
  | { type: "tick"; now: number; dayKey: string }
  | { type: "add-test-die" }
  | {
      type: "move";
      faces: DiePair;
      enemyDice?: DiePair | null;
      /** How many landmarks the rival met on an 攻擊 square has standing (0–4). */
      rivalBuilt?: number;
      /** Which of CITIES that rival lives in. */
      rivalCity?: number;
      now: number;
    }
  | { type: "weapon"; target?: number | null }
  | { type: "raided"; target: number }
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
    rivalCity: 0,
    hasNft: true,
    rivalHasNft: true,
    dstTakenToday: 0,
    rollCount: 0,
    log: [],
    nextLogId: 1,
    dayKey,
    walkFaces: null,
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

export function builtIndexes(landmarks: readonly Landmark[]): number[] {
  return landmarks.flatMap((landmark, index) => (landmark === "built" ? [index] : []));
}

/**
 * Which landmark the next build raises: the one under you, else a smashed one (cheaper to
 * repair), else the first empty one.
 */
export function raiseTarget(state: GameState): number | null {
  const here = TILES[state.position];
  if (here && here.landmarkIndex !== null && state.landmarks[here.landmarkIndex] !== "built") {
    return here.landmarkIndex;
  }
  const ruined = state.landmarks.indexOf("ruined");
  if (ruined !== -1) return ruined;
  const open = state.landmarks.indexOf("empty");
  return open === -1 ? null : open;
}

/**
 * Points needed for the next build, or null when all four stand. A new landmark costs the
 * next step of BUILD_COSTS; repairing a smashed one costs half of that.
 */
export function nextBuildCost(state: GameState): number | null {
  const index = raiseTarget(state);
  const full = buildCost(countBuilt(state.landmarks));
  if (index === null || full === null) return null;
  return state.landmarks[index] === "ruined" ? repairCost(full) : full;
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

function readLandmarks(value: unknown): Landmark[] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((item) => item === "empty" || item === "built" || item === "ruined")) {
    return null;
  }
  return [...value];
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function readWeapon(value: unknown): WeaponReadout | null {
  if (!value || typeof value !== "object") return null;
  const readout = value as Partial<WeaponReadout>;
  const { weapon, attackTotal, defenseTotal, enemyLuck, hit, dst, pointsGained, shieldBreak } = readout;
  const smashed = inRange(readout.smashed, 0, 3) ? readout.smashed : null;
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
  return { weapon, attackTotal, defenseTotal, enemyLuck, hit, dst, pointsGained, shieldBreak, smashed };
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
    rivalCity: inRange(value.rivalCity, 0, CITIES.length - 1) ? value.rivalCity : 0,
    hasNft: value.hasNft === true,
    rivalHasNft: value.rivalHasNft !== false,
    // Saves from before the rename kept this under rivalStolenToday.
    dstTakenToday: clampInt(value.dstTakenToday ?? value.rivalStolenToday, 0, DAILY_DST_CAP, 0),
    rollCount: clampInt(value.rollCount, 0, 1_000_000, 0),
    log,
    nextLogId: clampInt(value.nextLogId, 1, 1_000_000, 1),
    dayKey: typeof value.dayKey === "string" && value.dayKey ? value.dayKey : dayKey,
    walkFaces: readPair(value.walkFaces),
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
      // Before the first strike of a fight, the rival's shield follows their NFT.
      const fresh = state.phase === "search" && state.weaponReadout === null;
      return pushLog(
        { ...state, rivalHasNft: action.value, enemyShield: fresh ? action.value : state.enemyShield },
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
      const moved = movePoints(state.position, steps);
      const tile = TILES[moved.position];
      const enemyFaces = tile?.kind === "attack" ? readPair(action.enemyDice) : null;
      const searching = enemyFaces !== null;
      const enemyLuck = searching ? luckOf(enemyFaces) : null;
      const rivalCity =
        searching && inRange(action.rivalCity, 0, CITIES.length - 1) ? action.rivalCity : state.rivalCity;
      // A rival can't have more landmarks than their city has plots.
      const plots = plotCount(rivalCity);
      const rivalBuilt = Math.min(
        plots,
        inRange(action.rivalBuilt, 0, 4) ? action.rivalBuilt : countBuilt(state.rivalLandmarks),
      );
      const rivalLandmarks: Landmark[] = searching
        ? [0, 1, 2, 3].map((slot) => (slot < rivalBuilt ? "built" : "empty"))
        : state.rivalLandmarks;
      const passed = moved.passedStart ? "經過起點。" : "";
      const searchText = searching
        ? `這格是攻擊。搜尋敵人，配到阿強，佢有 ${rivalBuilt} 座建築。敵人擲出 ${enemyFaces[0]} 和 ${enemyFaces[1]}。幸運值 ${enemyLuck}。`
        : "這格只加分數。";
      const next: GameState = {
        ...state,
        phase: searching ? "search" : "walk",
        dice: spent.dice,
        lastRefillAt: spent.lastRefillAt,
        position: moved.position,
        points: state.points + moved.gained,
        rollCount: state.rollCount + 1,
        walkFaces: faces,
        lastRivalFaces: searching ? enemyFaces : null,
        rivalLandmarks,
        rivalCity,
        enemyLuck,
        // Only a rival holding an NFT has a shield.
        enemyShield: searching && state.rivalHasNft,
        fightSettled: false,
        weaponReadout: null,
      };
      return pushLog(
        next,
        "you",
        `你花 1 顆，擲出 ${faces[0]} 和 ${faces[1]}。走 ${steps} 格。${passed}走到${tile?.name ?? "這一格"}。分數 +${moved.gained}，合計 ${next.points}。${searchText}`,
      );
    }
    case "weapon": {
      if (state.phase !== "search" || state.enemyLuck === null || state.fightSettled) return state;
      // Once the shield is down, a hit smashes a landmark, so the attacker must pick a standing one.
      const standing = builtIndexes(state.rivalLandmarks);
      const target = action.target ?? null;
      if (!state.enemyShield && standing.length > 0 && (target === null || !standing.includes(target))) {
        return state;
      }
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
      let smashed: number | null = null;
      if (hit && state.enemyShield) {
        pointsGained = 1;
        shieldBreak = true;
        enemyShield = false;
        fightSettled = false;
      } else if (hit) {
        pointsGained = Math.min(5, Math.max(1, attackTotal - defenseTotal));
        const room = Math.max(0, DAILY_DST_CAP - state.dstTakenToday);
        dst = bothNft ? Math.min(pointsGained, room) : 0;
        if (standing.length > 0) smashed = target;
      }
      const rivalLandmarks =
        smashed === null
          ? state.rivalLandmarks
          : state.rivalLandmarks.map((item, index) => (index === smashed ? ("ruined" as const) : item));
      const weaponReadout: WeaponReadout = {
        weapon,
        attackTotal,
        defenseTotal,
        enemyLuck: state.enemyLuck,
        hit,
        dst,
        pointsGained,
        shieldBreak,
        smashed,
      };
      const verdict = shieldBreak ? "盾破" : hit ? "打中" : "打唔中";
      const pay = dst > 0 ? `搬走 ${dst} DST。` : "DST 0。";
      const smashText = smashed === null ? "" : `打爛咗阿強嘅${LANDMARK_NAMES[smashed]}。`;
      const nextPoints = state.points + pointsGained;
      return pushLog(
        {
          ...state,
          points: nextPoints,
          dstTakenToday: state.dstTakenToday + dst,
          rivalLandmarks,
          enemyShield,
          fightSettled,
          weaponReadout,
        },
        "you",
        `總攻擊 ${attackTotal}，總防守 ${defenseTotal}。${verdict}。${smashText}得 ${pointsGained} 分，合計 ${nextPoints}。${pay}`,
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
      const repairing = state.landmarks[index] === "ruined";
      const landmarks = state.landmarks.map((item, itemIndex) =>
        itemIndex === index ? ("built" as const) : item,
      );
      const next: GameState = { ...state, landmarks, points: state.points - cost };
      return pushLog(
        next,
        "you",
        `你花 ${cost} 分，${repairing ? "修好" : "起了"}${LANDMARK_NAMES[index]}。武器變成 ${countBuilt(landmarks)}。分數剩 ${next.points}。`,
      );
    }
    case "raided": {
      // Another player's hit lands on one of your standing landmarks.
      if (state.landmarks[action.target] !== "built") return state;
      const landmarks = state.landmarks.map((item, index) =>
        index === action.target ? ("ruined" as const) : item,
      );
      // Being hit earns nothing; the loss is the repair bill.
      const next: GameState = { ...state, landmarks };
      return pushLog(
        next,
        "rule",
        `阿強攻擊你，打爛咗你嘅${LANDMARK_NAMES[action.target]}。被打冇分，修返要半價。`,
      );
    }
    default:
      return state;
  }
}
