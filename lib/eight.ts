/**
 * 第二層 公開桌 on the 八字 board: two diamonds side by side that cross in the middle, like ∞.
 *
 * The outer loop is 32 steps (the middle square is passed twice, so 31 squares). Two gold inner
 * roads of 3 squares cut across the diamonds; at a fork the player picks the loop or the road.
 * Play is kept simple so the show carries it: land on an empty lot and you buy it, land on your
 * own and it goes up a level, land on someone else's and you pay rent.
 *
 * Each player pays 20 (200,000 能量 on screen) to sit down; the house keeps 2 and 18 is the stake. The game ends when
 * one player is left or everyone has had 12 turns; the richest (cash + land + levels) wins.
 *
 * The reducer is pure: dice, cards, where a plane flies and every choice arrive in actions.
 */

export const ENTRY_FEE = 20;
export const HOUSE_CUT = 2;
export const STAKE = ENTRY_FEE - HOUSE_CUT;

export const TURNS_EACH = 12;
/** Up to six at a table (a 領地 seats 2–6; the public table 2–4). */
export const MAX_SEATS = 6;
export const START_PAY = 2;
export const BAIL = 1;
export const CHEST_PAY = 3;
export const CROSS_PAY = 1;
export const TAX = 2;
// 2026-09-27: building up is cheaper (was 2) so more lots grow into bigger buildings.
export const UPGRADE_PRICE = 1;
/** Sky (2026-10-03): buying a lot (its first building) costs 1 (10,000 能量) too. */
export const LOT_PRICE = 1;
/** Buying or building only happens if at least this much cash is left afterwards (keeps players out of easy bankruptcy). */
export const BUY_RESERVE = 2;
export const MAX_LEVEL = 4;
/** Rent by level (1 house … 4 landmark); gold inner-road lots charge double. */
// 2026-09-27: every die walks on its own now (two stops a turn), so rent starts at 0.2, not 1.
export const RENTS = [0, 0.2, 0.5, 1, 1.5] as const;

/** Money is kept to one decimal place (0.2, 0.5 …), without floating-point crumbs. The screen shows it ×10,000 as 能量. */
const money = (value: number) => Math.round(value * 10) / 10;

/** Season points by finishing place, by table size. */
export const SEASON_POINTS: Record<number, readonly number[]> = {
  2: [2, 0],
  3: [3, 1, 0],
  4: [4, 2, 1, 0],
};

// ---------- The board ----------

/** Steps along each diamond edge. */
export const EDGE_STEPS = 4;
/** Corners of the loop, in walking order: left tip, bottom-left, middle, top-right, right tip, bottom-right, middle, top-left. */
export const LOOP_CORNERS = 8;
export const LOOP = LOOP_CORNERS * EDGE_STEPS;
export const MIDDLE = 8;
export const MIDDLE_AGAIN = 24;
export const JAIL = 16;

export type Road = "L" | "R";
export type Spot = { on: "loop"; i: number } | { on: Road; k: number };

/**
 * Fork squares on the loop: which road starts there and where it comes back onto the loop.
 * 2026-09-27: the inner roads are gone — the middle of each diamond is now a monster's island —
 * so there are no forks; the old fork squares are a chance square and a chest.
 */
export const FORKS: Record<number, { road: Road; exit: number }> = {};
export const ROAD_LENGTH = 3;

export type SquareKind =
  | "start" | "chest" | "cross" | "fly" | "dock" | "jail" | "chance" | "tax" | "fork" | "lot"
  // 三葉草 (領地 海島, Sky 2026-10-08): the plaza in the middle and the material squares round its three loops.
  | "plaza" | "wood" | "stone" | "gold" | "toll" | "map" | "artisan" | "caravan" | "termite" | "landslide" | "bandit" | "sand";
export type Square = { key: string; kind: SquareKind; price: number; gold: boolean; group: number };

const SPECIAL: Record<number, SquareKind> = {
  0: "start",
  4: "chest",
  8: "cross",
  12: "fly",
  14: "chance",
  16: "jail",
  20: "chance",
  28: "tax",
  30: "chest",
};

export function keyOf(spot: Spot): string {
  if (spot.on === "loop") return `o${spot.i === MIDDLE_AGAIN ? MIDDLE : spot.i}`;
  return `${spot.on}${spot.k}`;
}

export function spotOf(key: string): Spot {
  if (key[0] === "o") return { on: "loop", i: Number(key.slice(1)) };
  return { on: key[0] as Road, k: Number(key.slice(1)) };
}

/** Every square once, keyed: "o0"…"o31" (not "o24", the middle again) and "L1"…"R3". */
export const SQUARES: Record<string, Square> = (() => {
  const squares: Record<string, Square> = {};
  for (let i = 0; i < LOOP; i += 1) {
    if (i === MIDDLE_AGAIN) continue;
    const key = `o${i}`;
    const segment = Math.floor(i / EDGE_STEPS);
    const kind = SPECIAL[i] ?? "lot";
    squares[key] = { key, kind, price: kind === "lot" ? LOT_PRICE : 0, gold: false, group: segment };
  }
  return squares;
})();

export const LOT_KEYS = Object.values(SQUARES)
  .filter((square) => square.kind === "lot")
  .map((square) => square.key);

// ---------- Other boards (the 領地 lands use their own boards) ----------

export type BoardId = "eight" | "island" | "clover";

/** Everything the rules need to know about a board's shape. */
export type Board = {
  id: BoardId;
  squares: Record<string, Square>;
  lotKeys: string[];
  jail: number;
  keyOf: (spot: Spot) => string;
  nextSpot: (spot: Spot, takeRoad?: boolean) => Spot;
  isFork: (spot: Spot) => boolean;
};

/** 海島 (island): a plain ring of 20 around a lighthouse, with a pier where a boat sails you off. */
export const ISLAND_LOOP = 20;
export const ISLAND_JAIL = 15;
const ISLAND_SPECIAL: Record<number, SquareKind> = { 0: "start", 3: "chance", 5: "chest", 8: "tax", 10: "dock", 13: "chance", 15: "jail", 18: "chest" };
const ISLAND_SQUARES: Record<string, Square> = (() => {
  const squares: Record<string, Square> = {};
  for (let i = 0; i < ISLAND_LOOP; i += 1) {
    const kind = ISLAND_SPECIAL[i] ?? "lot";
    const group = Math.floor(i / 5);
    squares[`o${i}`] = { key: `o${i}`, kind, price: kind === "lot" ? LOT_PRICE : 0, gold: false, group };
  }
  return squares;
})();

/**
 * 三葉草 (Sky 2026-10-09): the 領地 island board, one path from the castle round and back: 廣場/城堡 (o0) → 石場
 * (o1–o6) → 森林 (o7–o12) → 金礦 (o13–o18) → 廣場. Six squares in each area, so the plaza is passed once a lap.
 */
export const CLOVER_PETAL = 6;
export const CLOVER_LOOP = CLOVER_PETAL * 3 + 1;
export type Material = "wood" | "stone" | "gold";
export const CLOVER_ZONES: readonly Material[] = ["stone", "wood", "gold"];
/** Sky (2026-10-09): every square is land to buy and build on — no materials, no penalties, no pictures. */
const CLOVER_PETALS: readonly (readonly SquareKind[])[] = [0, 1, 2].map(() => Array<SquareKind>(CLOVER_PETAL).fill("lot"));
export function cloverKey(i: number): string {
  const n = ((i % CLOVER_LOOP) + CLOVER_LOOP) % CLOVER_LOOP;
  return `o${n}`;
}
const CLOVER_SQUARES: Record<string, Square> = (() => {
  const squares: Record<string, Square> = { o0: { key: "o0", kind: "plaza", price: 0, gold: false, group: 0 } };
  CLOVER_PETALS.forEach((petal, z) =>
    petal.forEach((kind, k) => {
      const key = `o${z * CLOVER_PETAL + k + 1}`; // o1…o18
      squares[key] = { key, kind, price: kind === "lot" ? LOT_PRICE : 0, gold: false, group: z };
    }),
  );
  return squares;
})();
/** Material each loop's own squares give (the gold loop pays less, gold is dear). */
export const GATHER: Record<Material, number> = { wood: 2, stone: 2, gold: 1 };
/** What a material is worth at the end, in table money (for the standings). */
export const MATERIAL_WORTH: Record<Material, number> = { wood: 0.2, stone: 0.3, gold: 0.8 };
/** 地主關卡: the toll paid to the land's owner. */
export const TOLL = 1;
/** 藏寶圖: pieces needed for the treasure, and what it holds. */
export const MAP_PIECES = 3;
export const TREASURE = { gold: 2, cash: 3 } as const;
/** 流沙: squares back. */
export const SAND_BACK = 3;
export type MaterialStock = Record<Material, number>;
export const NO_MATERIALS: MaterialStock = { wood: 0, stone: 0, gold: 0 };

export const BOARDS: Record<BoardId, Board> = {
  eight: { id: "eight", squares: SQUARES, lotKeys: LOT_KEYS, jail: JAIL, keyOf, nextSpot, isFork },
  island: {
    id: "island",
    squares: ISLAND_SQUARES,
    lotKeys: Object.values(ISLAND_SQUARES).filter((s) => s.kind === "lot").map((s) => s.key),
    jail: ISLAND_JAIL,
    keyOf: (spot) => (spot.on === "loop" ? `o${spot.i}` : `${spot.on}${spot.k}`),
    nextSpot: (spot) => ({ on: "loop", i: ((spot.on === "loop" ? spot.i : 0) + 1) % ISLAND_LOOP }),
    isFork: () => false,
  },
  clover: {
    id: "clover",
    squares: CLOVER_SQUARES,
    lotKeys: Object.values(CLOVER_SQUARES).filter((s) => s.kind === "lot").map((s) => s.key),
    jail: 0,
    keyOf: (spot) => cloverKey(spot.on === "loop" ? spot.i : 0),
    nextSpot: (spot) => ({ on: "loop", i: ((spot.on === "loop" ? spot.i : 0) + 1) % CLOVER_LOOP }),
    isFork: () => false,
  },
};

export function isFork(spot: Spot): boolean {
  return spot.on === "loop" && FORKS[spot.i] !== undefined;
}

/** One step on from a spot; at a fork `takeRoad` turns onto the inner road. */
export function nextSpot(spot: Spot, takeRoad = false): Spot {
  if (spot.on === "loop") {
    const fork = FORKS[spot.i];
    if (takeRoad && fork) return { on: fork.road, k: 1 };
    return { on: "loop", i: (spot.i + 1) % LOOP };
  }
  if (spot.k < ROAD_LENGTH) return { on: spot.on, k: spot.k + 1 };
  const exit = Object.values(FORKS).find((fork) => fork.road === spot.on)!.exit;
  return { on: "loop", i: exit };
}

// ---------- Chance ----------

export type Card =
  | { kind: "money"; amount: number; text: string }
  | { kind: "forward"; steps: number; text: string }
  | { kind: "jail"; text: string };

export const CARDS: readonly Card[] = [
  { kind: "money", amount: 2, text: "路邊執到能量 +20,000" },
  { kind: "money", amount: 1, text: "中小獎 +10,000" },
  { kind: "money", amount: -1, text: "跌咗能量 −10,000" },
  { kind: "money", amount: -2, text: "整屋頂 −20,000" },
  { kind: "forward", steps: 3, text: "向前行三格" },
  { kind: "jail", text: "俾人捉咗，入獄" },
];

// ---------- State ----------

export type Seat = {
  name: string;
  avatar: string;
  colour: string;
  bot: boolean;
  cash: number;
  spot: Spot;
  jailed: boolean;
  bankrupt: boolean;
  turnsTaken: number;
  /** Power cards in hand (at most MAX_POWERS). */
  powers: Power[];
  /** 雙倍租: turns left (anyone's) during which this player's lots collect double rent. */
  doubleRent?: number;
  /** 三葉草: materials gathered this game, 藏寶圖 pieces held, and a 工匠 waiting to double the next haul. */
  stock?: MaterialStock;
  maps?: number;
  artisan?: boolean;
};

/** `locked`: turns left (anyone's) during which the lot collects no rent — a 封地 card. */
export type Deed = { owner: number; level: number; locked?: number };

/**
 * 功能卡: drawn instead of a chance card 3 times in 10, kept (two at most) and played before rolling.
 * boost 全城加建: every lot you own goes up a level · lock 封地: an opponent's best lot collects
 * no rent for two rounds · wreck 拆樓: an opponent's best lot drops a level (level 1 goes back to the
 * bank) · swap 換位: trade places with an opponent · shield 免租牌: the next rent you'd pay is let off
 * (used by itself when it happens).
 */
export type Power = "boost" | "lock" | "wreck" | "swap" | "shield" | "monster" | "levy" | "double";
/**
 * Sky (2026-10-03), two more: levy 收保護費 — every opponent pays you LEVY at once · double 雙倍租 —
 * your lots collect double rent for two rounds.
 */
export const POWERS: readonly Power[] = ["boost", "lock", "wreck", "swap", "shield", "monster", "levy", "double"];
export const LEVY = 1;
/** 怪獸卡: the monster on the target's side fires at them — they lose this much to you… */
export const MONSTER_STEAL = 2;
/** …and are knocked this many squares back. 護盾 (shield) blocks it. */
export const MONSTER_KNOCK = 3;
/** At most this many power cards lie on the board at once. */
export const MAX_PICKUPS = 6;
/** Sky (2026-10-03): three new power cards appear on the board each round. */
export const PICKUPS_PER_ROUND = 3;

/**
 * Which monster watches a loop square: the left diamond's or the right's; the middle square where
 * the two cross is watched by both (the left one answers).
 */
export function sideOf(spot: Spot): "left" | "right" {
  if (spot.on !== "loop") return spot.on === "L" ? "left" : "right";
  return spot.i > MIDDLE && spot.i < MIDDLE_AGAIN ? "right" : "left";
}
/** Sky (2026-10-03): a hand holds up to six power cards. */
export const MAX_POWERS = 6;
/** The two power cards every player starts the table with. */
export const START_POWERS: readonly Power[] = ["boost", "monster"];
/** Out of 10 chance draws, how many give a power card instead; and out of 10 chests. */
export const POWER_ODDS = 5;
export const CHEST_POWER_ODDS = 3;
/** Out of 10 crossroads (on top of the +1) and passes of start (on top of the pay). */
export const CROSS_POWER_ODDS = 2;
export const START_POWER_ODDS = 1;

/** A power card from this landing's draw, if the odds (out of 10) say so and there's room in the hand. */
function drawPower(state: TableState, seat: number, odds: number, events: TableEvent[], salt = 0): TableState | null {
  const player = state.seats[seat];
  if (state.draw.power === undefined || player.powers.length >= MAX_POWERS) return null;
  // Different places (salt) read the one random draw differently, so they don't all agree.
  const base = Math.abs(Math.floor(state.draw.power));
  const roll = salt ? (base * 31 + salt * 97) % 1000 : base;
  if (roll % 10 >= odds) return null;
  const power = POWERS[Math.floor(roll / 10) % POWERS.length];
  events.push({ kind: "power", seat, power });
  return withSeat(state, seat, { powers: [...player.powers, power] });
}

/** roll: waiting for dice · fork: stopped at a fork mid-walk, choose the way · over. */
export type TablePhase = "roll" | "fork" | "over";

/** What just happened, in order, for the screen to play back. */
export type TableEvent =
  | { kind: "turn"; seat: number }
  | { kind: "freed"; seat: number }
  | { kind: "step"; seat: number; to: Spot; passedStart: boolean }
  | { kind: "fork"; seat: number }
  | { kind: "bought"; seat: number; key: string; price: number }
  | { kind: "upgraded"; seat: number; key: string; level: number }
  | { kind: "rent"; seat: number; to: number; amount: number; key: string }
  | { kind: "bonus"; seat: number; amount: number; reason: "chest" | "cross" }
  | { kind: "tax"; seat: number; amount: number }
  | { kind: "card"; seat: number; card: Card }
  | { kind: "fly"; seat: number; to: Spot }
  | { kind: "jailed"; seat: number }
  | { kind: "bankrupt"; seat: number; to: number | null; lost: string[] }
  | { kind: "house"; seat: number; key: string; amount: number }
  /** Could have bought or built here, but it would have left less than BUY_RESERVE. */
  | { kind: "saved"; seat: number; key: string }
  /** The first die's walk is done; the second die is thrown now. */
  | { kind: "second"; seat: number; die: number }
  /** Drew a power card at a chance square. */
  | { kind: "power"; seat: number; power: Power }
  /** Played a power card. `levels`: each lot's new level (boost, wreck; 0 = back to the bank). */
  | { kind: "played"; seat: number; power: Power; target?: number; key?: string; levels?: Record<string, number>; paid?: Record<number, number> }
  /** A 雙倍租 ran out. */
  | { kind: "doubleOver"; seat: number }
  /** A 免租牌 let this rent off. */
  | { kind: "shielded"; seat: number; to: number; key: string }
  /** Landed on a 封地-locked lot: no rent. */
  | { kind: "lockedLot"; seat: number; key: string }
  /** A lock ran out. */
  | { kind: "unlocked"; key: string }
  /** A new round: a power card appears on a square (replacing any left over). */
  | { kind: "spawn"; key: string; power: Power }
  /** Landed on the square with the power card and took it. */
  | { kind: "pickup"; seat: number; key: string; power: Power }
  /** 怪獸卡: `side`'s monster fired at `target`: took `stolen` and knocked them back to `to` — or a 護盾 blocked it. */
  | { kind: "monster"; seat: number; target: number; side: "left" | "right"; stolen: number; to: Spot; blocked: boolean }
  /** 三葉草: materials gained (or lost, negative) on a square; `why` names the square. */
  | { kind: "gather"; seat: number; material: Material; amount: number; why: SquareKind }
  | { kind: "map"; seat: number; pieces: number }
  | { kind: "treasure"; seat: number; gold: number; cash: number }
  | { kind: "toll"; seat: number; amount: number }
  | { kind: "artisan"; seat: number }
  | { kind: "trade"; seat: number; give: Material; gave: number; take: Material; took: number }
  | { kind: "bandit"; seat: number; material: Material | null }
  | { kind: "sand"; seat: number; to: Spot };

/**
 * House rules for this table. The public table uses the defaults; a hosted game on someone's
 * 領地 can shorten the game (車站), keep some squares as the host's rent houses (租金屋, rent
 * paid to the host, capped at 6) and pick a published chance deck (機會屋).
 */
export type TableRules = {
  turnsEach: number;
  /** Square key → rent paid to the host by whoever lands there. */
  houses: Record<string, number>;
  cards: readonly Card[];
  /** 三葉草: the toll at each 地主關卡 (TOLL, more with 租金屋). */
  toll?: number;
};

export const RENT_CAP = 6;

export type TableState = {
  seats: Seat[];
  deeds: Record<string, Deed>;
  current: number;
  phase: TablePhase;
  /** Steps still to walk after a fork choice. */
  stepsLeft: number;
  /** The second die, still to walk once the first die's walk has landed (0 when none). */
  pending: number;
  /** The roll's card and plane draws, used when the walk ends. */
  draw: { card: number; fly: number; power?: number };
  lastDice: [number, number] | null;
  events: TableEvent[];
  /** Bumps on every action. */
  tick: number;
  rules: TableRules;
  board: BoardId;
  /** Rent paid to the host's rent houses this game. */
  hostIncome: number;
  /** A glowing power card waiting on a square; whoever lands there first takes it. A new one each round. */
  pickups: { key: string; power: Power }[];
  /** 三葉草: materials the 山賊 took, which go to the land's owner. */
  hostStock?: MaterialStock;
};

export type TableAction =
  | { type: "roll"; dice: [number, number]; card?: number; fly?: number; power?: number }
  | { type: "choose"; road: boolean }
  /** Play the power card in hand at `index`; `target` is the opponent for swap (lock and wreck pick their best lot). */
  | { type: "power"; index: number; target?: number };

export function newTable(
  players: { name: string; avatar: string; colour: string; bot: boolean }[],
  rules: Partial<TableRules> = {},
  board: BoardId = "eight",
): TableState {
  const B = BOARDS[board];
  const houses = Object.fromEntries(
    Object.entries(rules.houses ?? {})
      .filter(([key]) => B.squares[key]?.kind === "lot")
      .map(([key, rent]) => [key, Math.max(0, Math.min(RENT_CAP, Math.floor(rent)))]),
  );
  const clover = board === "clover";
  return {
    rules: { turnsEach: rules.turnsEach ?? TURNS_EACH, houses, cards: rules.cards?.length ? rules.cards : CARDS, ...(rules.toll ? { toll: rules.toll } : {}) },
    board,
    hostIncome: 0,
    // 三葉草 has no land to buy, so no power cards either: it's all about the materials.
    pickups: clover ? [] : [firstPickup(board, players.length)],

    seats: players.slice(0, MAX_SEATS).map((player) => ({
      ...player,
      cash: STAKE,
      spot: { on: "loop", i: 0 },
      jailed: false,
      bankrupt: false,
      turnsTaken: 0,
      // Sky (2026-10-03): everyone sits down holding two power cards — 全城加建 (土地升價) and 怪獸卡.
      powers: clover ? [] : [...START_POWERS],

    })),
    deeds: {},
    current: 0,
    phase: "roll",
    stepsLeft: 0,
    pending: 0,
    draw: { card: 0, fly: 0 },
    lastDice: null,
    events: [{ kind: "turn", seat: 0 }],
    tick: 0,
  };
}

export function rentOf(key: string, level: number, board: BoardId = "eight"): number {
  return money(RENTS[level] * (BOARDS[board].squares[key]?.gold ? 2 : 1));
}

/** Cash plus what land and levels cost to put down. */
export function netWorth(state: TableState, seat: number): number {
  const player = state.seats[seat];
  if (!player || player.bankrupt) return 0;
  const goods = player.stock ? CLOVER_ZONES.reduce((sum, m) => sum + player.stock![m] * MATERIAL_WORTH[m], 0) : 0;
  return goods + Object.entries(state.deeds).reduce(
    (sum, [key, deed]) => (deed.owner === seat ? sum + BOARDS[state.board].squares[key].price + (deed.level - 1) * UPGRADE_PRICE : sum),
    player.cash,
  );
}

/** Seats from richest to poorest; bankrupt seats last. */
export function standings(state: TableState): number[] {
  return state.seats
    .map((_, seat) => seat)
    .sort((a, b) => {
      const aOut = state.seats[a].bankrupt;
      const bOut = state.seats[b].bankrupt;
      if (aOut !== bOut) return aOut ? 1 : -1;
      return netWorth(state, b) - netWorth(state, a) || a - b;
    });
}

// ---------- Rules ----------

function withSeat(state: TableState, seat: number, change: Partial<Seat>): TableState {
  // Every change of cash goes through here, so this is where it's kept to one decimal place.
  const tidy = change.cash === undefined ? change : { ...change, cash: money(change.cash) };
  return { ...state, seats: state.seats.map((player, index) => (index === seat ? { ...player, ...tidy } : player)) };
}

function alive(state: TableState): number[] {
  return state.seats.flatMap((seat, index) => (seat.bankrupt ? [] : [index]));
}

function isOver(state: TableState): boolean {
  const left = alive(state);
  return left.length <= 1 || left.every((seat) => state.seats[seat].turnsTaken >= state.rules.turnsEach);
}

/** Pay from a seat to another seat (or the bank when `to` is null); short means bankrupt. */
function pay(state: TableState, seat: number, amount: number, to: number | null, events: TableEvent[]): TableState {
  const payer = state.seats[seat];
  if (payer.cash >= amount) {
    let next = withSeat(state, seat, { cash: money(payer.cash - amount) });
    if (to !== null) next = withSeat(next, to, { cash: money(next.seats[to].cash + amount) });
    return next;
  }
  let next = withSeat(state, seat, { cash: 0, bankrupt: true });
  if (to !== null) next = withSeat(next, to, { cash: money(next.seats[to].cash + payer.cash) });
  const lost = Object.keys(state.deeds).filter((key) => state.deeds[key].owner === seat);
  const deeds = { ...next.deeds };
  for (const key of lost) delete deeds[key];
  events.push({ kind: "bankrupt", seat, to, lost });
  return { ...next, deeds };
}

function step(state: TableState, seat: number, takeRoad: boolean, events: TableEvent[]): TableState {
  const player = state.seats[seat];
  const to = BOARDS[state.board].nextSpot(player.spot, takeRoad);
  const passedStart = to.on === "loop" && to.i === 0;
  // (On 三葉草 that's once a lap, at the start of the forest loop.)
  events.push({ kind: "step", seat, to, passedStart });
  const moved = withSeat(state, seat, { spot: to, cash: player.cash + (passedStart ? START_PAY : 0) });
  return passedStart ? (drawPower(moved, seat, START_POWER_ODDS, events, 2) ?? moved) : moved;
}

/** Walk the steps left, stopping at a fork to ask. */
function walk(state: TableState, seat: number, events: TableEvent[]): TableState {
  let next = state;
  while (next.stepsLeft > 0) {
    if (BOARDS[next.board].isFork(next.seats[seat].spot)) {
      events.push({ kind: "fork", seat });
      return { ...next, phase: "fork" };
    }
    next = { ...step(next, seat, false, events), stepsLeft: next.stepsLeft - 1 };
  }
  const before = events.length;
  const landed = land(next, seat, events, 0);
  // Each die walks on its own: after the first one lands, throw the second, unless that square
  // ended the turn (jail, a plane or boat ride, going broke).
  const stopped = events.slice(before).some((e) => e.kind === "fly" || e.kind === "jailed") || landed.seats[seat].bankrupt;
  if (landed.pending > 0 && !stopped) {
    events.push({ kind: "second", seat, die: landed.pending });
    return walk({ ...landed, stepsLeft: landed.pending, pending: 0 }, seat, events);
  }
  return finishTurn({ ...landed, pending: 0 }, events);
}

/** What the square under the seat does. */
function land(state: TableState, seat: number, events: TableEvent[], depth: number): TableState {
  // The round's power card lies here: take it (if there's room in the hand), then the square as usual.
  const at = BOARDS[state.board].keyOf(state.seats[seat].spot);
  const waiting = state.pickups.find((p) => p.key === at);
  if (depth === 0 && waiting && state.seats[seat].powers.length < MAX_POWERS) {
    events.push({ kind: "pickup", seat, key: at, power: waiting.power });
    state = {
      ...withSeat(state, seat, { powers: [...state.seats[seat].powers, waiting.power] }),
      pickups: state.pickups.filter((p) => p !== waiting),
    };
  }
  const player = state.seats[seat];
  const B = BOARDS[state.board];
  const key = B.keyOf(player.spot);
  const square = B.squares[key];
  switch (square.kind) {
    case "lot": {
      const house = state.rules.houses[key];
      if (house !== undefined) {
        // The host's rent house: pay the host, never for sale.
        const paid = Math.min(house, player.cash);
        events.push({ kind: "house", seat, key, amount: paid });
        const next = pay(state, seat, house, null, events);
        return { ...next, hostIncome: next.hostIncome + paid };
      }
      const deed = state.deeds[key];
      if (!deed) {
        if (player.cash - square.price < BUY_RESERVE) {
          events.push({ kind: "saved", seat, key });
          return state;
        }
        events.push({ kind: "bought", seat, key, price: square.price });
        return { ...withSeat(state, seat, { cash: player.cash - square.price }), deeds: { ...state.deeds, [key]: { owner: seat, level: 1 } } };
      }
      if (deed.owner === seat) {
        if (deed.level >= MAX_LEVEL) return state;
        if (player.cash - UPGRADE_PRICE < BUY_RESERVE) {
          events.push({ kind: "saved", seat, key });
          return state;
        }
        const level = deed.level + 1;
        events.push({ kind: "upgraded", seat, key, level });
        return { ...withSeat(state, seat, { cash: player.cash - UPGRADE_PRICE }), deeds: { ...state.deeds, [key]: { owner: seat, level } } };
      }
      if (deed.locked) {
        events.push({ kind: "lockedLot", seat, key });
        return state;
      }
      const shield = player.powers.indexOf("shield");
      if (shield >= 0) {
        events.push({ kind: "shielded", seat, to: deed.owner, key });
        return withSeat(state, seat, { powers: player.powers.filter((_, i) => i !== shield) });
      }
      const rent = rentOf(key, deed.level, state.board) * (state.seats[deed.owner]?.doubleRent ? 2 : 1);
      events.push({ kind: "rent", seat, to: deed.owner, amount: Math.min(rent, player.cash), key });
      return pay(state, seat, rent, deed.owner, events);
    }
    case "chest": {
      const carded = drawPower(state, seat, CHEST_POWER_ODDS, events);
      if (carded) return carded;
      events.push({ kind: "bonus", seat, amount: CHEST_PAY, reason: "chest" });
      return withSeat(state, seat, { cash: player.cash + CHEST_PAY });
    }
    case "cross": {
      events.push({ kind: "bonus", seat, amount: CROSS_PAY, reason: "cross" });
      const paid = withSeat(state, seat, { cash: player.cash + CROSS_PAY });
      return drawPower(paid, seat, CROSS_POWER_ODDS, events, 1) ?? paid;
    }
    case "tax":
      events.push({ kind: "tax", seat, amount: Math.min(TAX, player.cash) });
      return pay(state, seat, TAX, null, events);
    case "fly":
    case "dock": {
      if (depth > 0) return state;
      const forSale = B.lotKeys.filter((lot) => state.rules.houses[lot] === undefined);
      const empty = forSale.filter((lot) => !state.deeds[lot]);
      const pool = empty.length > 0 ? empty : forSale;
      const to = spotOf(pool[((state.draw.fly % pool.length) + pool.length) % pool.length]);
      events.push({ kind: "fly", seat, to });
      return land(withSeat(state, seat, { spot: to }), seat, events, depth + 1);
    }
    case "chance": {
      if (depth > 0) return state;
      // Half the draws are a power card, if there's room in the hand.
      const carded = drawPower(state, seat, POWER_ODDS, events);
      if (carded) return carded;
      const deck = state.rules.cards;
      const card = deck[((state.draw.card % deck.length) + deck.length) % deck.length];
      events.push({ kind: "card", seat, card });
      if (card.kind === "money") {
        if (card.amount >= 0) return withSeat(state, seat, { cash: player.cash + card.amount });
        return pay(state, seat, -card.amount, null, events);
      }
      if (card.kind === "jail") {
        events.push({ kind: "jailed", seat });
        return withSeat(state, seat, { spot: { on: "loop", i: B.jail }, jailed: true });
      }
      // Forward along the loop (forks are passed straight), then deal with that square once.
      let next = state;
      for (let s = 0; s < card.steps; s += 1) next = step(next, seat, false, events);
      return land(next, seat, events, depth + 1);
    }
    case "wood":
    case "stone":
    case "gold": {
      const amount = GATHER[square.kind] * (player.artisan ? 2 : 1);
      events.push({ kind: "gather", seat, material: square.kind, amount, why: square.kind });
      return withSeat(state, seat, { stock: addMaterial(player.stock, square.kind, amount), artisan: false });
    }
    case "map": {
      const pieces = (player.maps ?? 0) + 1;
      if (pieces < MAP_PIECES) {
        events.push({ kind: "map", seat, pieces });
        return withSeat(state, seat, { maps: pieces });
      }
      events.push({ kind: "treasure", seat, gold: TREASURE.gold, cash: TREASURE.cash });
      return withSeat(state, seat, { maps: 0, cash: player.cash + TREASURE.cash, stock: addMaterial(player.stock, "gold", TREASURE.gold) });
    }
    case "artisan":
      events.push({ kind: "artisan", seat });
      return withSeat(state, seat, { artisan: true });
    case "caravan": {
      // 商隊: 2 of whatever you have most of (wood or stone) for 1 gold; with nothing to trade, a gift of 1 wood.
      const stock = player.stock ?? { ...NO_MATERIALS };
      const give: Material = stock.stone > stock.wood ? "stone" : "wood";
      if (stock[give] >= 2) {
        events.push({ kind: "trade", seat, give, gave: 2, take: "gold", took: 1 });
        return withSeat(state, seat, { stock: addMaterial(addMaterial(stock, give, -2), "gold", 1) });
      }
      events.push({ kind: "gather", seat, material: "wood", amount: 1, why: "caravan" });
      return withSeat(state, seat, { stock: addMaterial(stock, "wood", 1) });
    }
    case "termite":
    case "landslide": {
      const material: Material = square.kind === "termite" ? "wood" : "stone";
      const lost = Math.min(1, player.stock?.[material] ?? 0);
      events.push({ kind: "gather", seat, material, amount: -lost, why: square.kind });
      return lost ? withSeat(state, seat, { stock: addMaterial(player.stock, material, -lost) }) : state;
    }
    case "bandit": {
      // 山賊: takes one of your dearest material, for the land's owner.
      const stock = player.stock ?? { ...NO_MATERIALS };
      const material = (["gold", "stone", "wood"] as Material[]).find((m) => stock[m] > 0) ?? null;
      events.push({ kind: "bandit", seat, material });
      if (!material) return state;
      return { ...withSeat(state, seat, { stock: addMaterial(stock, material, -1) }), hostStock: addMaterial(state.hostStock, material, 1) };
    }
    case "toll": {
      const toll = state.rules.toll ?? TOLL;
      const paid = Math.min(toll, player.cash);
      events.push({ kind: "toll", seat, amount: paid });
      const next = pay(state, seat, toll, null, events);
      return { ...next, hostIncome: money(next.hostIncome + paid) };
    }
    case "sand": {
      if (depth > 0) return state;
      let spot = player.spot;
      for (let k = 0; k < SAND_BACK; k++) spot = stepBack(state.board, spot);
      events.push({ kind: "sand", seat, to: spot });
      return withSeat(state, seat, { spot });
    }
    default:
      return state;
  }
}

function addMaterial(stock: MaterialStock | undefined, material: Material, amount: number): MaterialStock {
  const now = { ...(stock ?? NO_MATERIALS) };
  now[material] = Math.max(0, now[material] + amount);
  return now;
}

/** Hand the turn to the next seat still playing, or finish the game. */
function finishTurn(state: TableState, events: TableEvent[]): TableState {
  // Locks count down one per turn played.
  let deeds = state.deeds;
  for (const [key, deed] of Object.entries(state.deeds)) {
    if (!deed.locked) continue;
    deeds = deeds === state.deeds ? { ...deeds } : deeds;
    const locked = deed.locked - 1;
    deeds[key] = locked > 0 ? { ...deed, locked } : { owner: deed.owner, level: deed.level };
    if (locked <= 0) events.push({ kind: "unlocked", key });
  }
  let done = withSeat({ ...state, deeds }, state.current, { turnsTaken: state.seats[state.current].turnsTaken + 1 });
  // 雙倍租 counts down with every turn, like a lock.
  done.seats.forEach((seat, i) => {
    if (!seat.doubleRent) return;
    const left = seat.doubleRent - 1;
    done = withSeat(done, i, { doubleRent: left > 0 ? left : undefined });
    if (left <= 0) events.push({ kind: "doubleOver", seat: i });
  });
  // Everyone still playing has had another turn: a new round, and three more power cards on the board
  // (they stay until taken, up to MAX_PICKUPS at once).
  const round = (s: TableState) => Math.min(...alive(s).map((i) => s.seats[i].turnsTaken));
  if (done.board !== "clover" && alive(done).length > 0 && round(done) > round(state) && round(done) < done.rules.turnsEach) {
    for (let n = 0; n < PICKUPS_PER_ROUND && done.pickups.length < MAX_PICKUPS; n += 1) {
      const pickup = nextPickup(done, round(done), n);
      if (!pickup) break;
      events.push({ kind: "spawn", ...pickup });
      done = { ...done, pickups: [...done.pickups, pickup] };
    }
  }
  if (isOver(done)) return { ...done, phase: "over", stepsLeft: 0 };
  let seat = done.current;
  for (let i = 0; i < done.seats.length; i += 1) {
    seat = (seat + 1) % done.seats.length;
    if (!done.seats[seat].bankrupt && done.seats[seat].turnsTaken < done.rules.turnsEach) break;
  }
  events.push({ kind: "turn", seat });
  return { ...done, current: seat, phase: "roll", stepsLeft: 0 };
}

function isFace(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function reduceTable(state: TableState, action: TableAction): TableState {
  if (state.phase === "over") return state;
  const seat = state.current;
  const events: TableEvent[] = [];
  const bump = (next: TableState): TableState => ({ ...next, events, tick: state.tick + 1 });

  if (action.type === "roll") {
    const [a, b] = action.dice ?? [];
    if (state.phase !== "roll" || !isFace(a) || !isFace(b)) return state;
    let next: TableState = { ...state, lastDice: [a, b], draw: { card: action.card ?? 0, fly: action.fly ?? 0, power: action.power } };
    if (next.seats[seat].jailed) {
      events.push({ kind: "freed", seat });
      next = withSeat(pay(next, seat, BAIL, null, events), seat, { jailed: false });
      if (next.seats[seat].bankrupt) return bump(finishTurn(next, events));
    }
    return bump(walk({ ...next, stepsLeft: a, pending: b }, seat, events));
  }

  if (action.type === "power") {
    if (state.phase !== "roll") return state;
    const next = playPower(state, seat, action.index, action.target, events);
    return next === state ? state : bump(next);
  }

  if (action.type === "choose") {
    if (state.phase !== "fork") return state;
    const next = { ...step(state, seat, action.road, events), stepsLeft: state.stepsLeft - 1, phase: "roll" as const };
    return bump(walk(next, seat, events));
  }

  return state;
}

/** Squares a power card can appear on: anything but start and jail, and not the host's rent houses. */
function pickupSquares(board: BoardId, houses: Record<string, number> = {}): string[] {
  return Object.values(BOARDS[board].squares)
    .filter((s) => s.kind !== "start" && s.kind !== "jail" && houses[s.key] === undefined)
    .map((s) => s.key);
}

function firstPickup(board: BoardId, players: number): { key: string; power: Power } {
  const squares = pickupSquares(board);
  return { key: squares[(players * 7 + 5) % squares.length], power: POWERS[players % POWERS.length] };
}

/** The new round's card: on a square with no card yet, picked from the last roll's draw. */
function nextPickup(state: TableState, round: number, nth = 0): { key: string; power: Power } | null {
  const taken = new Set(state.pickups.map((p) => p.key));
  const squares = pickupSquares(state.board, state.rules.houses).filter((key) => !taken.has(key));
  if (squares.length === 0) return null;
  const seed = Math.abs(Math.floor(state.draw.power ?? state.draw.card)) + round * 131 + state.tick * 17 + nth * 977;
  return { key: squares[seed % squares.length], power: POWERS[Math.floor(seed / 7) % POWERS.length] };
}

/** One square back along the loop (the island ring too). */
function stepBack(board: BoardId, spot: Spot): Spot {
  const loop = board === "island" ? ISLAND_LOOP : board === "clover" ? CLOVER_LOOP : LOOP;
  const i = spot.on === "loop" ? spot.i : 0;
  return { on: "loop", i: (i - 1 + loop) % loop };
}

/** Seats still playing, other than `seat`. */
function opponents(state: TableState, seat: number): number[] {
  return alive(state).filter((other) => other !== seat);
}

/** The opponent lot a lock or wreck goes for: highest level, then dearest rent. */
export function bestTarget(state: TableState, seat: number): string | null {
  const theirs = Object.entries(state.deeds).filter(([, d]) => d.owner !== seat && !state.seats[d.owner]?.bankrupt);
  if (theirs.length === 0) return null;
  theirs.sort(([ka, a], [kb, b]) => b.level - a.level || rentOf(kb, b.level, state.board) - rentOf(ka, a.level, state.board) || (ka < kb ? -1 : 1));
  return theirs[0][0];
}

/** Whether a power card can do anything right now (shield only works by itself). */
export function canPlay(state: TableState, seat: number, power: Power): boolean {
  if (power === "shield") return false;
  if (power === "boost") return Object.values(state.deeds).some((d) => d.owner === seat && d.level < MAX_LEVEL);
  if (power === "swap" || power === "monster") return opponents(state, seat).length > 0;
  if (power === "levy") return opponents(state, seat).some((other) => state.seats[other].cash > 0);
  if (power === "double") return !state.seats[seat].doubleRent && Object.values(state.deeds).some((d) => d.owner === seat);
  if (power === "lock") {
    const key = bestTarget(state, seat);
    return key !== null && !state.deeds[key].locked;
  }
  return bestTarget(state, seat) !== null;
}

function playPower(state: TableState, seat: number, index: number, target: number | undefined, events: TableEvent[]): TableState {
  const player = state.seats[seat];
  const power = player.powers[index];
  if (!power || !canPlay(state, seat, power)) return state;
  const hand = { powers: player.powers.filter((_, i) => i !== index) };
  if (power === "boost") {
    const deeds = { ...state.deeds };
    const levels: Record<string, number> = {};
    for (const [key, deed] of Object.entries(state.deeds)) {
      if (deed.owner !== seat || deed.level >= MAX_LEVEL) continue;
      deeds[key] = { ...deed, level: deed.level + 1 };
      levels[key] = deed.level + 1;
    }
    events.push({ kind: "played", seat, power, levels });
    return { ...withSeat(state, seat, hand), deeds };
  }
  if (power === "levy") {
    let next = withSeat(state, seat, hand);
    const paid: Record<number, number> = {};
    let total = 0;
    for (const other of opponents(state, seat)) {
      const amount = Math.min(LEVY, next.seats[other].cash);
      if (amount <= 0) continue;
      paid[other] = amount;
      total += amount;
      next = withSeat(next, other, { cash: money(next.seats[other].cash - amount) });
    }
    events.push({ kind: "played", seat, power, paid });
    return withSeat(next, seat, { cash: money(next.seats[seat].cash + total) });
  }
  if (power === "double") {
    // Two rounds: every seat still playing gets two turns before it wears off.
    events.push({ kind: "played", seat, power });
    return withSeat(state, seat, { ...hand, doubleRent: alive(state).length * 2 });
  }
  if (power === "lock" || power === "wreck") {
    const key = bestTarget(state, seat)!;
    const deed = state.deeds[key];
    const deeds = { ...state.deeds };
    if (power === "lock") {
      // Two rounds: every seat still playing gets two turns before it opens again.
      deeds[key] = { ...deed, locked: alive(state).length * 2 };
      events.push({ kind: "played", seat, power, key, target: deed.owner });
    } else {
      if (deed.level > 1) deeds[key] = { ...deed, level: deed.level - 1 };
      else delete deeds[key];
      events.push({ kind: "played", seat, power, key, target: deed.owner, levels: { [key]: deed.level - 1 } });
    }
    return { ...withSeat(state, seat, hand), deeds };
  }
  if (power === "monster") {
    const others = opponents(state, seat);
    const other = target !== undefined && others.includes(target) ? target : others[0];
    const victim = state.seats[other];
    const side = sideOf(victim.spot);
    const guard = victim.powers.indexOf("shield");
    if (guard >= 0) {
      events.push({ kind: "monster", seat, target: other, side, stolen: 0, to: victim.spot, blocked: true });
      return withSeat(withSeat(state, seat, hand), other, { powers: victim.powers.filter((_, i) => i !== guard) });
    }
    const stolen = Math.min(MONSTER_STEAL, victim.cash);
    // Knocked back along the loop (someone in jail stays behind bars).
    let to = victim.spot;
    if (!victim.jailed) for (let s = 0; s < MONSTER_KNOCK; s += 1) to = stepBack(state.board, to);
    events.push({ kind: "monster", seat, target: other, side, stolen, to, blocked: false });
    const paid = withSeat(withSeat(state, seat, { ...hand, cash: player.cash + stolen }), other, { cash: victim.cash - stolen, spot: to });
    return paid;
  }
  // swap
  const others = opponents(state, seat);
  const other = target !== undefined && others.includes(target) ? target : others[0];
  const mine = player.spot, theirs = state.seats[other].spot;
  events.push({ kind: "played", seat, power, target: other });
  return withSeat(withSeat(withSeat(state, seat, hand), seat, { spot: theirs }), other, { spot: mine });
}

/** A simple computer player. */
export function botMove(state: TableState, random: () => number): TableAction {
  if (state.phase === "fork") return { type: "choose", road: random() < 0.5 };
  // Half the time, play a card that would do something.
  const hand = state.seats[state.current].powers;
  const index = hand.findIndex((power) => canPlay(state, state.current, power));
  if (index >= 0 && random() < 0.5) {
    const others = opponents(state, state.current);
    return { type: "power", index, target: others[Math.floor(random() * others.length)] };
  }
  const die = () => 1 + Math.floor(random() * 6);
  return { type: "roll", dice: [die(), die()], card: Math.floor(random() * 1000), fly: Math.floor(random() * 1000), power: Math.floor(random() * 1000) };
}
