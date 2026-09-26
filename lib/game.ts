import { LANDMARK_NAMES, TILES, TILE_INFO, type TileKind } from "./board";
import { CITIES, plotCount } from "./cities";
import {
  CHEST_DEFAULT,
  CHEST_MAX,
  CHEST_MIN,
  DAILY_DST_CAP,
  DICE_CAP,
  NFT_ATTACK,
  NFT_SLOTS,
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
  landmarks: Landmark[];
  rivalLandmarks: Landmark[];
  /** Which of CITIES the current rival lives in. */
  rivalCity: number;
  /** The five NFT slots: each holds an NFT id or is empty. Any NFT placed means you hold one. */
  nfts: (string | null)[];
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
  landing: Landing | null;
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
      /** Points in the chest, if the walk stops on 寶箱 (3–6). */
      chest?: number;
      now: number;
    }
  | { type: "weapon"; target?: number | null }
  | { type: "raided"; target: number }
  | { type: "return-walk" }
  | { type: "build" }
  | { type: "place-nft"; slot: number; id: string }
  | { type: "remove-nft"; slot: number }
  | { type: "set-rival-nft"; value: boolean }
  | { type: "reset"; now: number; dayKey: string }
  | { type: "hydrate"; state: GameState; now: number; dayKey: string };

export const STORAGE_KEY = "dafuweng-daily-board-v3";
export const STARTING_DICE = 2;

const emptyLandmarks = (): Landmark[] => ["empty", "empty", "empty", "empty"];
const emptyNfts = (): (string | null)[] => Array.from({ length: NFT_SLOTS }, () => null);

/** How many NFTs sit in your slots. */
export function nftCount(state: Pick<GameState, "nfts">): number {
  return state.nfts.filter((id) => id !== null).length;
}

/** Placing any NFT counts as holding one: that unlocks DST and the shield. */
export function holdsNft(state: Pick<GameState, "nfts">): boolean {
  return nftCount(state) > 0;
}

/** Attack power: 10, +5 per standing building, +NFT_ATTACK per NFT placed. */
export function attackPower(state: Pick<GameState, "landmarks" | "nfts">): number {
  return 10 + countBuilt(state.landmarks) * 5 + nftCount(state) * NFT_ATTACK;
}

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
    nfts: emptyNfts(),
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
    landing: null,
  };
}

export function countBuilt(landmarks: readonly Landmark[]): number {
  return landmarks.filter((landmark) => landmark === "built").length;
}

export function builtIndexes(landmarks: readonly Landmark[]): number[] {
  return landmarks.flatMap((landmark, index) => (landmark === "built" ? [index] : []));
}

/** Which landmark the next build raises: a smashed one first (cheaper to repair), else the first empty one. */
export function raiseTarget(state: GameState): number | null {
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
  const smashed = inRange(readout.smashed, 0, 3) ? readout.smashed : null;
  if (
    !inRange(weapon, 0, 4) ||
    !inRange(attackTotal, 10, 30 + NFT_SLOTS * NFT_ATTACK) ||
    !inRange(defenseTotal, 2, 32) ||
    !inRange(enemyLuck, 2, 12) ||
    typeof hit !== "boolean" ||
    !inRange(dst, 0, DAILY_DST_CAP) ||
    !inRange(pointsGained, 0, 6) ||
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
    nfts: readNfts(value.nfts),
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
      const chest = inRange(action.chest, CHEST_MIN, CHEST_MAX) ? action.chest : CHEST_DEFAULT;
      const moved = landOn(state.position, steps, state.points, spent.dice, chest);
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
      const passed = moved.landing.passedStart ? "經過起點。" : "";
      const change = moved.landing.points;
      const effect = searching
        ? `搜尋敵人，配到阿強，佢有 ${rivalBuilt} 座建築。敵人擲出 ${enemyFaces[0]} 和 ${enemyFaces[1]}。幸運值 ${enemyLuck}。`
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
        `你花 1 顆，擲出 ${faces[0]} 和 ${faces[1]}。走 ${steps} 格。${passed}走到${TILE_INFO[tile.kind].icon}${tile.name}。分數 ${change >= 0 ? "+" : ""}${change}，合計 ${next.points}。${effect}`,
      );
    }
    case "weapon": {
      if (state.phase !== "search" || state.enemyLuck === null || state.fightSettled) return state;
      // One tap settles the fight: the attacker picks a standing landmark (if any), and a hit
      // breaks the shield on the way through before smashing it.
      const standing = builtIndexes(state.rivalLandmarks);
      const target = action.target ?? null;
      if (standing.length > 0 && (target === null || !standing.includes(target))) {
        return state;
      }
      const weapon = countBuilt(state.landmarks);
      const attackTotal = attackPower(state);
      const defenseTotal = countBuilt(state.rivalLandmarks) * 5 + state.enemyLuck;
      const hit = attackTotal > defenseTotal;
      const bothNft = holdsNft(state) && state.rivalHasNft;
      let pointsGained = 0;
      let dst = 0;
      let smashed: number | null = null;
      const shieldBreak = hit && state.enemyShield;
      if (hit) {
        const smashPoints = Math.min(5, Math.max(1, attackTotal - defenseTotal));
        // Breaking a shield adds 1 point; DST only follows the smash itself.
        pointsGained = smashPoints + (shieldBreak ? 1 : 0);
        const room = Math.max(0, DAILY_DST_CAP - state.dstTakenToday);
        dst = bothNft ? Math.min(smashPoints, room) : 0;
        if (standing.length > 0) smashed = target;
      }
      const enemyShield = state.enemyShield && !hit;
      const fightSettled = true;
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
      const verdict = shieldBreak ? "盾破，打中" : hit ? "打中" : "打唔中";
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
