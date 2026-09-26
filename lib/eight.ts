/**
 * 第二層 公開桌 on the 八字 board: two diamonds side by side that cross in the middle, like ∞.
 *
 * The outer loop is 32 steps (the middle square is passed twice, so 31 squares). Two gold inner
 * roads of 3 squares cut across the diamonds; at a fork the player picks the loop or the road.
 * Play is kept simple so the show carries it: land on an empty lot and you buy it, land on your
 * own and it goes up a level, land on someone else's and you pay rent.
 *
 * Each player pays 20 DST to sit down; the house keeps 2 and 18 is the stake. The game ends when
 * one player is left or everyone has had 12 turns; the richest (cash + land + levels) wins.
 *
 * The reducer is pure: dice, cards, where a plane flies and every choice arrive in actions.
 */

export const ENTRY_FEE = 20;
export const HOUSE_CUT = 2;
export const STAKE = ENTRY_FEE - HOUSE_CUT;

export const TURNS_EACH = 12;
export const START_PAY = 2;
export const BAIL = 1;
export const CHEST_PAY = 3;
export const CROSS_PAY = 1;
export const TAX = 2;
export const UPGRADE_PRICE = 2;
export const MAX_LEVEL = 4;
/** Rent by level (1 house … 4 landmark); gold inner-road lots charge double. */
export const RENTS = [0, 1, 2, 4, 6] as const;

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

/** Fork squares on the loop: which road starts there and where it comes back onto the loop. */
export const FORKS: Record<number, { road: Road; exit: number }> = {
  30: { road: "L", exit: 6 },
  14: { road: "R", exit: 22 },
};
export const ROAD_LENGTH = 3;

export type SquareKind = "start" | "chest" | "cross" | "fly" | "jail" | "chance" | "tax" | "fork" | "lot";
export type Square = { key: string; kind: SquareKind; price: number; gold: boolean; group: number };

const SPECIAL: Record<number, SquareKind> = {
  0: "start",
  4: "chest",
  8: "cross",
  12: "fly",
  14: "fork",
  16: "jail",
  20: "chance",
  28: "tax",
  30: "fork",
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
    squares[key] = { key, kind, price: kind === "lot" ? (segment % 4 === 3 ? 3 : 2) : 0, gold: false, group: segment };
  }
  for (const road of ["L", "R"] as const) {
    for (let k = 1; k <= ROAD_LENGTH; k += 1) {
      const key = `${road}${k}`;
      squares[key] = { key, kind: "lot", price: 4, gold: true, group: -1 };
    }
  }
  return squares;
})();

export const LOT_KEYS = Object.values(SQUARES)
  .filter((square) => square.kind === "lot")
  .map((square) => square.key);

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
  { kind: "money", amount: 2, text: "路邊執到錢 +2" },
  { kind: "money", amount: 1, text: "中小獎 +1" },
  { kind: "money", amount: -1, text: "跌咗錢 −1" },
  { kind: "money", amount: -2, text: "整屋頂 −2" },
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
};

export type Deed = { owner: number; level: number };

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
  | { kind: "bankrupt"; seat: number; to: number | null; lost: string[] };

export type TableState = {
  seats: Seat[];
  deeds: Record<string, Deed>;
  current: number;
  phase: TablePhase;
  /** Steps still to walk after a fork choice. */
  stepsLeft: number;
  /** The roll's card and plane draws, used when the walk ends. */
  draw: { card: number; fly: number };
  lastDice: [number, number] | null;
  events: TableEvent[];
  /** Bumps on every action. */
  tick: number;
};

export type TableAction =
  | { type: "roll"; dice: [number, number]; card?: number; fly?: number }
  | { type: "choose"; road: boolean };

export function newTable(players: { name: string; avatar: string; colour: string; bot: boolean }[]): TableState {
  return {
    seats: players.slice(0, 4).map((player) => ({
      ...player,
      cash: STAKE,
      spot: { on: "loop", i: 0 },
      jailed: false,
      bankrupt: false,
      turnsTaken: 0,
    })),
    deeds: {},
    current: 0,
    phase: "roll",
    stepsLeft: 0,
    draw: { card: 0, fly: 0 },
    lastDice: null,
    events: [{ kind: "turn", seat: 0 }],
    tick: 0,
  };
}

export function rentOf(key: string, level: number): number {
  return RENTS[level] * (SQUARES[key]?.gold ? 2 : 1);
}

/** Cash plus what land and levels cost to put down. */
export function netWorth(state: TableState, seat: number): number {
  const player = state.seats[seat];
  if (!player || player.bankrupt) return 0;
  return Object.entries(state.deeds).reduce(
    (sum, [key, deed]) => (deed.owner === seat ? sum + SQUARES[key].price + (deed.level - 1) * UPGRADE_PRICE : sum),
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
  return { ...state, seats: state.seats.map((player, index) => (index === seat ? { ...player, ...change } : player)) };
}

function alive(state: TableState): number[] {
  return state.seats.flatMap((seat, index) => (seat.bankrupt ? [] : [index]));
}

function isOver(state: TableState): boolean {
  const left = alive(state);
  return left.length <= 1 || left.every((seat) => state.seats[seat].turnsTaken >= TURNS_EACH);
}

/** Pay from a seat to another seat (or the bank when `to` is null); short means bankrupt. */
function pay(state: TableState, seat: number, amount: number, to: number | null, events: TableEvent[]): TableState {
  const payer = state.seats[seat];
  if (payer.cash >= amount) {
    let next = withSeat(state, seat, { cash: payer.cash - amount });
    if (to !== null) next = withSeat(next, to, { cash: next.seats[to].cash + amount });
    return next;
  }
  let next = withSeat(state, seat, { cash: 0, bankrupt: true });
  if (to !== null) next = withSeat(next, to, { cash: next.seats[to].cash + payer.cash });
  const lost = Object.keys(state.deeds).filter((key) => state.deeds[key].owner === seat);
  const deeds = { ...next.deeds };
  for (const key of lost) delete deeds[key];
  events.push({ kind: "bankrupt", seat, to, lost });
  return { ...next, deeds };
}

function step(state: TableState, seat: number, takeRoad: boolean, events: TableEvent[]): TableState {
  const player = state.seats[seat];
  const to = nextSpot(player.spot, takeRoad);
  const passedStart = to.on === "loop" && to.i === 0;
  events.push({ kind: "step", seat, to, passedStart });
  return withSeat(state, seat, { spot: to, cash: player.cash + (passedStart ? START_PAY : 0) });
}

/** Walk the steps left, stopping at a fork to ask. */
function walk(state: TableState, seat: number, events: TableEvent[]): TableState {
  let next = state;
  while (next.stepsLeft > 0) {
    if (isFork(next.seats[seat].spot)) {
      events.push({ kind: "fork", seat });
      return { ...next, phase: "fork" };
    }
    next = { ...step(next, seat, false, events), stepsLeft: next.stepsLeft - 1 };
  }
  return finishTurn(land(next, seat, events, 0), events);
}

/** What the square under the seat does. */
function land(state: TableState, seat: number, events: TableEvent[], depth: number): TableState {
  const player = state.seats[seat];
  const key = keyOf(player.spot);
  const square = SQUARES[key];
  switch (square.kind) {
    case "lot": {
      const deed = state.deeds[key];
      if (!deed) {
        if (player.cash < square.price) return state;
        events.push({ kind: "bought", seat, key, price: square.price });
        return { ...withSeat(state, seat, { cash: player.cash - square.price }), deeds: { ...state.deeds, [key]: { owner: seat, level: 1 } } };
      }
      if (deed.owner === seat) {
        if (deed.level >= MAX_LEVEL || player.cash < UPGRADE_PRICE) return state;
        const level = deed.level + 1;
        events.push({ kind: "upgraded", seat, key, level });
        return { ...withSeat(state, seat, { cash: player.cash - UPGRADE_PRICE }), deeds: { ...state.deeds, [key]: { owner: seat, level } } };
      }
      const rent = rentOf(key, deed.level);
      events.push({ kind: "rent", seat, to: deed.owner, amount: Math.min(rent, player.cash), key });
      return pay(state, seat, rent, deed.owner, events);
    }
    case "chest":
      events.push({ kind: "bonus", seat, amount: CHEST_PAY, reason: "chest" });
      return withSeat(state, seat, { cash: player.cash + CHEST_PAY });
    case "cross":
      events.push({ kind: "bonus", seat, amount: CROSS_PAY, reason: "cross" });
      return withSeat(state, seat, { cash: player.cash + CROSS_PAY });
    case "tax":
      events.push({ kind: "tax", seat, amount: Math.min(TAX, player.cash) });
      return pay(state, seat, TAX, null, events);
    case "fly": {
      if (depth > 0) return state;
      const empty = LOT_KEYS.filter((lot) => !state.deeds[lot]);
      const pool = empty.length > 0 ? empty : LOT_KEYS;
      const to = spotOf(pool[((state.draw.fly % pool.length) + pool.length) % pool.length]);
      events.push({ kind: "fly", seat, to });
      return land(withSeat(state, seat, { spot: to }), seat, events, depth + 1);
    }
    case "chance": {
      if (depth > 0) return state;
      const card = CARDS[((state.draw.card % CARDS.length) + CARDS.length) % CARDS.length];
      events.push({ kind: "card", seat, card });
      if (card.kind === "money") {
        if (card.amount >= 0) return withSeat(state, seat, { cash: player.cash + card.amount });
        return pay(state, seat, -card.amount, null, events);
      }
      if (card.kind === "jail") {
        events.push({ kind: "jailed", seat });
        return withSeat(state, seat, { spot: { on: "loop", i: JAIL }, jailed: true });
      }
      // Forward along the loop (forks are passed straight), then deal with that square once.
      let next = state;
      for (let s = 0; s < card.steps; s += 1) next = step(next, seat, false, events);
      return land(next, seat, events, depth + 1);
    }
    default:
      return state;
  }
}

/** Hand the turn to the next seat still playing, or finish the game. */
function finishTurn(state: TableState, events: TableEvent[]): TableState {
  const done = withSeat(state, state.current, { turnsTaken: state.seats[state.current].turnsTaken + 1 });
  if (isOver(done)) return { ...done, phase: "over", stepsLeft: 0 };
  let seat = done.current;
  for (let i = 0; i < done.seats.length; i += 1) {
    seat = (seat + 1) % done.seats.length;
    if (!done.seats[seat].bankrupt && done.seats[seat].turnsTaken < TURNS_EACH) break;
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
    let next: TableState = { ...state, lastDice: [a, b], draw: { card: action.card ?? 0, fly: action.fly ?? 0 } };
    if (next.seats[seat].jailed) {
      events.push({ kind: "freed", seat });
      next = withSeat(pay(next, seat, BAIL, null, events), seat, { jailed: false });
      if (next.seats[seat].bankrupt) return bump(finishTurn(next, events));
    }
    return bump(walk({ ...next, stepsLeft: a + b }, seat, events));
  }

  if (action.type === "choose") {
    if (state.phase !== "fork") return state;
    const next = { ...step(state, seat, action.road, events), stepsLeft: state.stepsLeft - 1, phase: "roll" as const };
    return bump(walk(next, seat, events));
  }

  return state;
}

/** A simple computer player. */
export function botMove(state: TableState, random: () => number): TableAction {
  if (state.phase === "fork") return { type: "choose", road: random() < 0.5 };
  const die = () => 1 + Math.floor(random() * 6);
  return { type: "roll", dice: [die(), die()], card: Math.floor(random() * 1000), fly: Math.floor(random() * 1000) };
}
