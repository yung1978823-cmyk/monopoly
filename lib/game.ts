import { LANDMARK_NAMES, TILES } from "./board";
import {
  DAILY_DST_CAP,
  POINTS,
  PURSE_MAX,
  ROLL_COST,
  addTestDie,
  applyRefill,
  attackBand,
  dstTaken,
  landmarkIsSmashed,
  spendDice,
} from "./rules";

export type Landmark = "empty" | "built" | "ruined";

export type LogTone = "you" | "rival" | "rule";

export type LogEntry = {
  id: number;
  tone: LogTone;
  text: string;
};

export type DiePair = [number, number];

export type StrikeReadout = {
  attacker: "you" | "rival";
  faces: DiePair;
  luck: number;
  yourPower: number;
  rivalPower: number;
  attackTotal: number;
  defense: number;
  dst: number;
};

export type GameState = {
  position: number;
  dice: number;
  lastRefillAt: number;
  rivalDice: number;
  rivalLastRefillAt: number;
  points: number;
  rivalPoints: number;
  landmarks: Landmark[];
  rivalLandmarks: Landmark[];
  hasNft: boolean;
  postedPurse: number;
  playerStolenToday: number;
  rivalStolenToday: number;
  rollCount: number;
  log: LogEntry[];
  nextLogId: number;
  pendingBuildIndex: number | null;
  dayKey: string;
  lastPlayerFaces: DiePair | null;
  lastRivalFaces: DiePair | null;
  lastStrike: StrikeReadout | null;
};

export type Action =
  | { type: "tick"; now: number; dayKey: string }
  | { type: "add-test-die" }
  | { type: "move"; dice: DiePair; now: number }
  | { type: "build" }
  | { type: "skip-build" }
  | { type: "attack"; dice: DiePair; target: number | null; now: number }
  | { type: "rival"; dice: DiePair; now: number }
  | { type: "set-nft"; value: boolean }
  | { type: "set-purse"; value: number }
  | { type: "reset"; now: number; dayKey: string }
  | { type: "hydrate"; state: GameState; now: number; dayKey: string };

export const STORAGE_KEY = "dafuweng-daily-board-v2";
export const STARTING_DICE = 6;

const emptyLandmarks = (): Landmark[] => ["empty", "empty", "empty", "empty"];

export function createGame(now: number, dayKey: string): GameState {
  return {
    position: 0,
    dice: STARTING_DICE,
    lastRefillAt: now,
    rivalDice: 20,
    rivalLastRefillAt: now,
    points: 0,
    rivalPoints: 0,
    landmarks: emptyLandmarks(),
    rivalLandmarks: ["built", "built", "empty", "empty"],
    hasNft: true,
    postedPurse: 5,
    playerStolenToday: 0,
    rivalStolenToday: 0,
    rollCount: 0,
    log: [],
    nextLogId: 1,
    pendingBuildIndex: null,
    dayKey,
    lastPlayerFaces: null,
    lastRivalFaces: null,
    lastStrike: null,
  };
}

export function countBuilt(landmarks: readonly Landmark[]): number {
  return landmarks.filter((landmark) => landmark === "built").length;
}

export function firstBuilt(landmarks: readonly Landmark[]): number | null {
  const index = landmarks.findIndex((landmark) => landmark === "built");
  return index === -1 ? null : index;
}

export function raiseTarget(state: GameState): number | null {
  if (
    state.pendingBuildIndex !== null &&
    state.landmarks[state.pendingBuildIndex] !== "built"
  ) {
    return state.pendingBuildIndex;
  }
  const here = TILES[state.position];
  if (here && here.landmarkIndex !== null && state.landmarks[here.landmarkIndex] !== "built") {
    return here.landmarkIndex;
  }
  const open = state.landmarks.findIndex((landmark) => landmark !== "built");
  return open === -1 ? null : open;
}

export function remainingPurse(
  hasNft: boolean,
  posted: number,
  stolenToday: number,
): number {
  if (!hasNft) return 0;
  return Math.max(0, posted - stolenToday);
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

function isLandmark(value: unknown): value is Landmark {
  return value === "empty" || value === "built" || value === "ruined";
}

function readLandmarks(value: unknown): Landmark[] | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(isLandmark)) {
    return null;
  }
  return [...value];
}

export function sanitizeState(
  raw: unknown,
  now: number,
  dayKey: string,
): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<GameState>;
  if (typeof value.position !== "number" || value.position < 0 || value.position > 11) {
    return null;
  }
  const landmarks = readLandmarks(value.landmarks);
  const rivalLandmarks = readLandmarks(value.rivalLandmarks);
  if (!landmarks || !rivalLandmarks) return null;
  const clampInt = (input: unknown, min: number, max: number, fallback: number) => {
    if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(input)));
  };
  return {
    position: value.position,
    dice: clampInt(value.dice, 0, 20, 0),
    lastRefillAt:
      typeof value.lastRefillAt === "number" ? value.lastRefillAt : now,
    rivalDice: clampInt(value.rivalDice, 0, 20, 20),
    rivalLastRefillAt:
      typeof value.rivalLastRefillAt === "number" ? value.rivalLastRefillAt : now,
    points: clampInt(value.points, 0, 1_000_000, 0),
    rivalPoints: clampInt(value.rivalPoints, 0, 1_000_000, 0),
    landmarks,
    rivalLandmarks,
    hasNft: value.hasNft === true,
    postedPurse: clampInt(value.postedPurse, 0, PURSE_MAX, 0),
    playerStolenToday: clampInt(value.playerStolenToday, 0, DAILY_DST_CAP, 0),
    rivalStolenToday: clampInt(value.rivalStolenToday, 0, DAILY_DST_CAP, 0),
    rollCount: clampInt(value.rollCount, 0, 1_000_000, 0),
    log: Array.isArray(value.log)
      ? value.log
          .filter(
            (entry): entry is LogEntry =>
              !!entry &&
              typeof entry === "object" &&
              typeof (entry as LogEntry).id === "number" &&
              typeof (entry as LogEntry).text === "string" &&
              ((entry as LogEntry).tone === "you" ||
                (entry as LogEntry).tone === "rival" ||
                (entry as LogEntry).tone === "rule"),
          )
          .slice(0, 40)
      : [],
    nextLogId: clampInt(value.nextLogId, 1, 1_000_000, 1),
    pendingBuildIndex:
      typeof value.pendingBuildIndex === "number" &&
      value.pendingBuildIndex >= 0 &&
      value.pendingBuildIndex <= 3
        ? value.pendingBuildIndex
        : null,
    dayKey: typeof value.dayKey === "string" && value.dayKey ? value.dayKey : dayKey,
    lastPlayerFaces: readPair(value.lastPlayerFaces),
    lastRivalFaces: readPair(value.lastRivalFaces),
    lastStrike: readStrike(value.lastStrike),
  };
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function readStrike(value: unknown): StrikeReadout | null {
  if (!value || typeof value !== "object") return null;
  const strike = value as Partial<StrikeReadout>;
  const faces = readPair(strike.faces);
  const { attacker, luck, yourPower, rivalPower, attackTotal, defense, dst } = strike;
  if (
    !faces ||
    (attacker !== "you" && attacker !== "rival") ||
    !inRange(luck, 2, 12) ||
    !inRange(yourPower, 0, 4) ||
    !inRange(rivalPower, 0, 4) ||
    !inRange(attackTotal, 2, 16) ||
    !inRange(defense, 0, 4) ||
    !inRange(dst, 0, DAILY_DST_CAP)
  ) {
    return null;
  }
  return { attacker, faces, luck, yourPower, rivalPower, attackTotal, defense, dst };
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

function dstClause(args: {
  attack: number;
  defense: number;
  defenderHasNft: boolean;
  remainingBefore: number;
  stolenBefore: number;
  dst: number;
  walletName: string;
}): string {
  const band = attackBand(args.attack, args.defense);
  if (!args.defenderHasNft) return "沒有 NFT，DST 拿走 0。";
  if (args.remainingBefore <= 0) return "沒有放出剩餘錢包，DST 拿走 0。";
  if (args.stolenBefore >= DAILY_DST_CAP) return "今日已到 5 DST 上限，拿走 0。";
  if (band === "below" || args.dst === 0) return "低過，拿走 0 DST。";
  const left = args.remainingBefore - args.dst;
  const stolen = args.stolenBefore + args.dst;
  const after = `${args.walletName}剩 ${left} DST。今日已拿走 ${stolen}／5。`;
  if (band === "equal") return `等於，拿走 ${args.dst} DST。${after}`;
  const formula = Math.max(2, args.attack - args.defense + 1);
  const capped = Math.min(DAILY_DST_CAP, formula);
  const limited = args.dst < capped ? "受錢包或當日上限擋住，" : "";
  return `高過，攻擊 − 防守 + 1 = ${formula}，${limited}拿走 ${args.dst} DST。${after}`;
}

function applyAttack(
  state: GameState,
  attacker: "player" | "rival",
  dice: DiePair,
  target: number | null,
  now: number,
): GameState {
  const playerAttacks = attacker === "player";
  const pool = playerAttacks ? state.dice : state.rivalDice;
  if (pool < ROLL_COST || !readPair(dice)) return state;

  const defenderLandmarks = playerAttacks ? state.rivalLandmarks : state.landmarks;
  const defense = countBuilt(defenderLandmarks);
  const builtIndexes = defenderLandmarks
    .map((landmark, index) => (landmark === "built" ? index : -1))
    .filter((index) => index >= 0);

  if (builtIndexes.length > 0 && (target === null || !builtIndexes.includes(target))) {
    return state;
  }

  const spend = spendDice(
    pool,
    playerAttacks ? state.lastRefillAt : state.rivalLastRefillAt,
    now,
    ROLL_COST,
  );
  if (!spend) return state;

  const yourPower = countBuilt(state.landmarks);
  const rivalPower = countBuilt(state.rivalLandmarks);
  const luck = luckOf(dice);
  const attackTotal = (playerAttacks ? yourPower : rivalPower) + luck;
  const stolenBefore = playerAttacks ? state.rivalStolenToday : state.playerStolenToday;
  const posted = playerAttacks ? PURSE_MAX : state.postedPurse;
  const remainingBefore = remainingPurse(state.hasNft, posted, stolenBefore);
  const dst = dstTaken({
    attack: attackTotal,
    defense,
    defenderHasNft: state.hasNft,
    remainingPurse: remainingBefore,
    stolenToday: stolenBefore,
  });
  const smashed = landmarkIsSmashed(
    attackTotal,
    defense,
    target !== null && defenderLandmarks[target] === "built",
  );
  const nextLandmarks =
    smashed && target !== null
      ? defenderLandmarks.map((landmark, index) =>
          index === target ? ("ruined" as const) : landmark,
        )
      : defenderLandmarks;
  const connect = attackTotal >= defense;
  const attackerGain = connect ? POINTS.attackHitAttacker : POINTS.attackMissAttacker;
  const defenderGain = connect ? POINTS.attackHitDefender : POINTS.attackMissDefender;
  const targetName = target === null ? null : LANDMARK_NAMES[target];
  const smashText = smashed
    ? `砸碎${targetName}，變成廢墟。`
    : targetName
      ? "地標守住了。"
      : "";
  const walletName = playerAttacks ? "阿強的錢包" : "你的錢包";
  const clause = dstClause({
    attack: attackTotal,
    defense,
    defenderHasNft: state.hasNft,
    remainingBefore,
    stolenBefore,
    dst,
    walletName,
  });
  const scoreText = playerAttacks
    ? `你 +${attackerGain} 分，阿強 +${defenderGain} 分。`
    : `阿強 +${attackerGain} 分，你 +${defenderGain} 分。`;
  const aim = targetName
    ? `瞄準${playerAttacks ? "阿強的" : "你的"}${targetName}。`
    : "板上沒有已建成的地標。";
  const who = playerAttacks ? "你" : "阿強";
  const text = `${who}花 2 顆，擲出 ${dice[0]} 和 ${dice[1]}。幸運值 ${luck}。你的戰鬥力 ${yourPower}，阿強的戰鬥力 ${rivalPower}。攻擊 ${attackTotal}，防守 ${defense}。${aim}${smashText}${clause}${scoreText}`;
  const strike: StrikeReadout = {
    attacker: playerAttacks ? "you" : "rival",
    faces: dice,
    luck,
    yourPower,
    rivalPower,
    attackTotal,
    defense,
    dst,
  };

  const next: GameState = {
    ...state,
    points: state.points + (playerAttacks ? attackerGain : defenderGain),
    rivalPoints: state.rivalPoints + (playerAttacks ? defenderGain : attackerGain),
    landmarks: playerAttacks ? state.landmarks : nextLandmarks,
    rivalLandmarks: playerAttacks ? nextLandmarks : state.rivalLandmarks,
    playerStolenToday: playerAttacks ? state.playerStolenToday : state.playerStolenToday + dst,
    rivalStolenToday: playerAttacks ? state.rivalStolenToday + dst : state.rivalStolenToday,
    lastPlayerFaces: playerAttacks ? dice : state.lastPlayerFaces,
    lastRivalFaces: playerAttacks ? state.lastRivalFaces : dice,
    lastStrike: strike,
  };
  if (playerAttacks) {
    next.dice = spend.dice;
    next.lastRefillAt = spend.lastRefillAt;
  } else {
    next.rivalDice = spend.dice;
    next.rivalLastRefillAt = spend.lastRefillAt;
  }
  return pushLog(next, playerAttacks ? "you" : "rival", text);
}

export function rivalCanStrike(state: GameState): boolean {
  if (state.rivalDice < ROLL_COST || state.pendingBuildIndex !== null) return false;
  if (countBuilt(state.landmarks) > 0) return true;
  return (
    remainingPurse(state.hasNft, state.postedPurse, state.playerStolenToday) > 0 &&
    state.playerStolenToday < DAILY_DST_CAP
  );
}

function rollDay(state: GameState, now: number, dayKey: string): GameState {
  const player = applyRefill(state.dice, state.lastRefillAt, now);
  const rival = applyRefill(state.rivalDice, state.rivalLastRefillAt, now);
  const dayChanged = dayKey !== state.dayKey;
  if (player.gained === 0 && rival.gained === 0 && !dayChanged) return state;

  let next: GameState = {
    ...state,
    dice: player.dice,
    lastRefillAt: player.lastRefillAt,
    rivalDice: rival.dice,
    rivalLastRefillAt: rival.lastRefillAt,
  };
  if (player.gained > 0) {
    next = pushLog(
      next,
      "rule",
      `30 分鐘到了，補上 ${player.gained} 顆。現在 ${player.dice}／20。骰子不出售。`,
    );
  }

  if (dayKey === next.dayKey) return next;
  next = {
    ...next,
    dayKey,
    postedPurse: 0,
    playerStolenToday: 0,
    rivalStolenToday: 0,
  };
  return pushLog(
    next,
    "rule",
    "新的一天。今日錢包要重新放出，已被拿走的 DST 從 0 再算。一日最多 5 DST。",
  );
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "hydrate": {
      const clean = sanitizeState(action.state, action.now, action.dayKey);
      if (!clean) return createGame(action.now, action.dayKey);
      return rollDay(clean, action.now, action.dayKey);
    }
    case "reset":
      return createGame(action.now, action.dayKey);
    case "tick":
      return rollDay(state, action.now, action.dayKey);
    case "add-test-die": {
      if (state.dice >= 20) return state;
      const dice = addTestDie(state.dice);
      return { ...state, dice };
    }
    case "set-nft": {
      if (state.hasNft === action.value) return state;
      const next = { ...state, hasNft: action.value };
      return pushLog(
        next,
        "rule",
        action.value
          ? "試作開關打開：你有 NFT。可以放出最多 5 DST。阿強也是 NFT 防守方，錢包 5 DST。"
          : "試作開關關掉：沒有 NFT。分數照計，DST 進出是 0。",
      );
    }
    case "set-purse": {
      if (!state.hasNft) return state;
      const value = Math.max(0, Math.min(PURSE_MAX, Math.floor(action.value)));
      if (value === state.postedPurse) return state;
      const next = { ...state, postedPurse: value };
      const left = remainingPurse(true, value, state.playerStolenToday);
      return pushLog(
        next,
        "rule",
        `你今日放出 ${value} DST。現在可被拿走的還有 ${left} DST。`,
      );
    }
    case "move": {
      const faces = readPair(action.dice);
      if (!faces || state.dice < ROLL_COST) return state;
      const spent = spendDice(state.dice, state.lastRefillAt, action.now, ROLL_COST);
      if (!spent) return state;
      const luck = luckOf(faces);
      const moved = movePoints(state.position, luck);
      const tile = TILES[moved.position];
      let pending: number | null = null;
      let extra = "";
      if (tile.kind === "landmark" && tile.landmarkIndex !== null) {
        const landmark = state.landmarks[tile.landmarkIndex];
        if (landmark === "built") {
          extra = "這座還在，戰鬥力算它。";
        } else {
          pending = tile.landmarkIndex;
          extra = landmark === "ruined" ? "這裡是廢墟，可以再蓋。" : "這一格還沒蓋。";
        }
      }
      const passed = moved.passedStart ? "經過起點。" : "";
      const next: GameState = {
        ...state,
        dice: spent.dice,
        lastRefillAt: spent.lastRefillAt,
        position: moved.position,
        points: state.points + moved.gained,
        rollCount: state.rollCount + 1,
        pendingBuildIndex: pending,
        lastPlayerFaces: faces,
        lastStrike: null,
      };
      return pushLog(
        next,
        "you",
        `你花 2 顆，擲出 ${faces[0]} 和 ${faces[1]}。幸運值 ${luck}，走 ${luck} 格。${passed}走到${tile.name}。分數 +${moved.gained}，合計 ${next.points}。${extra}`,
      );
    }
    case "build": {
      const index = raiseTarget(state);
      if (index === null) return state;
      const landmark = state.landmarks[index];
      if (landmark === "built") return state;
      const landmarks = state.landmarks.map((item, itemIndex) =>
        itemIndex === index ? ("built" as const) : item,
      );
      const defense = countBuilt(landmarks);
      const next: GameState = {
        ...state,
        landmarks,
        points: state.points + POINTS.build,
        pendingBuildIndex: null,
      };
      return pushLog(
        next,
        "you",
        `你起了${LANDMARK_NAMES[index]}。戰鬥力變成 ${defense}。分數 +${POINTS.build}，合計 ${next.points}。`,
      );
    }
    case "skip-build": {
      if (state.pendingBuildIndex === null) return state;
      const name = LANDMARK_NAMES[state.pendingBuildIndex];
      return pushLog(
        { ...state, pendingBuildIndex: null },
        "you",
        `你先不蓋${name}。`,
      );
    }
    case "attack": {
      return applyAttack(state, "player", action.dice, action.target, action.now);
    }
    case "rival": {
      if (state.pendingBuildIndex !== null || !rivalCanStrike(state)) return state;
      const target = firstBuilt(state.landmarks);
      return applyAttack(state, "rival", action.dice, target, action.now);
    }
    default:
      return state;
  }
}

export function previewMove(state: GameState, dice: DiePair, now: number): GameState {
  return reduce(state, { type: "move", dice, now });
}
