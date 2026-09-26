/**
 * 第二層 公開桌: a short game of real Monopoly for 2–4 players on the 28-square board.
 *
 * Each player pays 20 DST to sit down; the house keeps 2 as its ticket and the other 18 is the
 * player's stake for the game. Land costs 4, a house 2, rent runs 1 → 2 → 3 → 4 → 6 (hotel),
 * passing start pays 1 and bail is 1. The game ends when only one player is left standing or
 * everyone has had 12 turns; then the richest (cash + land + buildings) wins.
 *
 * The reducer is pure: dice, cards and every choice arrive in actions.
 */

export const ENTRY_FEE = 20;
export const HOUSE_CUT = 2;
export const STAKE = ENTRY_FEE - HOUSE_CUT;

export const TABLE_SIZE = 28;
export const LOT_PRICE = 4;
export const HOUSE_PRICE = 2;
/** Rent by buildings on a lot: none, 1–3 houses, hotel. */
export const RENTS = [1, 2, 3, 4, 6] as const;
export const HOTEL = RENTS.length - 1;
export const START_PAY = 1;
export const BAIL = 1;
export const JAIL_SQUARE = 7;
export const GO_TO_JAIL_SQUARE = 21;
export const MAX_JAIL_TURNS = 3;
export const TURNS_EACH = 12;

/** Season points by finishing place, by table size. */
export const SEASON_POINTS: Record<number, readonly number[]> = {
  2: [2, 0],
  3: [3, 1, 0],
  4: [4, 2, 1, 0],
};

export type ColourGroup = "brown" | "sky" | "pink" | "orange" | "red" | "green";

export type Square =
  | { kind: "start" }
  | { kind: "jail" }
  | { kind: "parking" }
  | { kind: "go-to-jail" }
  | { kind: "chance" }
  | { kind: "lot"; group: ColourGroup; name: string };

export const GROUP_COLOURS: Record<ColourGroup, string> = {
  brown: "#9A5B2E",
  sky: "#38BDF8",
  pink: "#EC4899",
  orange: "#F59E0B",
  red: "#E52521",
  green: "#22A447",
};

const L = (group: ColourGroup, name: string): Square => ({ kind: "lot", group, name });
const C: Square = { kind: "chance" };

/** 4 corners, 18 lots in 6 colours of 3, and 6 chance squares. */
export const TABLE_SQUARES: readonly Square[] = [
  { kind: "start" },
  L("brown", "木屋巷"), L("brown", "磚窯街"), C, L("brown", "柴房口"), L("sky", "藍湖邊"), L("sky", "水車坊"),
  { kind: "jail" },
  L("sky", "魚港"), C, L("pink", "糖果街"), C, L("pink", "花園道"), L("pink", "蝴蝶巷"),
  { kind: "parking" },
  L("orange", "南瓜田"), L("orange", "麵包坊"), C, L("orange", "蜜糖路"), L("red", "火龍街"), L("red", "紅磚道"),
  { kind: "go-to-jail" },
  L("red", "鐘樓"), C, L("green", "森林口"), C, L("green", "竹林"), L("green", "蘑菇村"),
];

export function lotsInGroup(group: ColourGroup): number[] {
  return TABLE_SQUARES.flatMap((square, index) => (square.kind === "lot" && square.group === group ? [index] : []));
}

/** Chance cards. Money cards net to zero; the moves add swing, and jail costs a little. */
export type Card =
  | { kind: "money"; amount: number; text: string }
  | { kind: "to-start"; text: string }
  | { kind: "back"; steps: number; text: string }
  | { kind: "jail"; text: string };

export const CARDS: readonly Card[] = [
  { kind: "money", amount: 2, text: "執到錢包 +2" },
  { kind: "money", amount: 1, text: "賣舊嘢 +1" },
  { kind: "money", amount: -1, text: "交電費 −1" },
  { kind: "money", amount: -2, text: "整屋頂 −2" },
  { kind: "to-start", text: "飛返起點" },
  { kind: "back", steps: 3, text: "行錯路，退後 3 格" },
  { kind: "jail", text: "俾人捉咗，入獄" },
  { kind: "money", amount: 1, text: "中小獎 +1" },
  { kind: "money", amount: -1, text: "罰款 −1" },
];

export type Seat = {
  name: string;
  avatar: string;
  colour: string;
  bot: boolean;
  cash: number;
  position: number;
  /** 0 = free; 1–3 = which turn in jail this is. */
  jail: number;
  bankrupt: boolean;
  turnsTaken: number;
};

/** roll: waiting for dice · buy: may buy the lot just landed on · act: may build, then end the turn · over. */
export type TablePhase = "roll" | "buy" | "act" | "over";

/** What just happened, for the pop-up and sound on screen. */
export type TableEvent =
  | { kind: "moved"; seat: number; from: number; to: number; passedStart: boolean }
  | { kind: "rent"; seat: number; to: number; amount: number }
  | { kind: "bought"; seat: number; square: number }
  | { kind: "built"; seat: number; square: number; level: number }
  | { kind: "card"; seat: number; card: Card }
  | { kind: "jailed"; seat: number }
  | { kind: "freed"; seat: number; paid: boolean }
  | { kind: "stuck"; seat: number }
  | { kind: "bankrupt"; seat: number; to: number | null }
  | { kind: "turn"; seat: number };

export type TableState = {
  seats: Seat[];
  /** Owner seat per square, or null. */
  owners: (number | null)[];
  /** Buildings per square: 0 none, 1–3 houses, 4 hotel. */
  buildings: number[];
  current: number;
  phase: TablePhase;
  lastDice: [number, number] | null;
  events: TableEvent[];
  /** Bumps on every action, so the screen can replay each batch of events once. */
  tick: number;
};

export type TableAction =
  | { type: "roll"; dice: [number, number]; card?: number }
  | { type: "bail" }
  | { type: "buy" }
  | { type: "skip" }
  | { type: "build"; square: number }
  | { type: "end-turn" };

export function newTable(players: { name: string; avatar: string; colour: string; bot: boolean }[]): TableState {
  return {
    seats: players.slice(0, 4).map((player) => ({
      ...player,
      cash: STAKE,
      position: 0,
      jail: 0,
      bankrupt: false,
      turnsTaken: 0,
    })),
    owners: TABLE_SQUARES.map(() => null),
    buildings: TABLE_SQUARES.map(() => 0),
    current: 0,
    phase: "roll",
    lastDice: null,
    events: [{ kind: "turn", seat: 0 }],
    tick: 0,
  };
}

export function rentOf(state: TableState, square: number): number {
  return RENTS[state.buildings[square] ?? 0];
}

/** Whether this seat owns every lot of the group the square belongs to. */
export function ownsGroup(state: TableState, seat: number, square: number): boolean {
  const lot = TABLE_SQUARES[square];
  if (lot?.kind !== "lot") return false;
  return lotsInGroup(lot.group).every((index) => state.owners[index] === seat);
}

/** Lots this seat may add a building to right now: a full colour set, below hotel, even building. */
export function buildable(state: TableState, seat: number): number[] {
  const player = state.seats[seat];
  if (!player || player.bankrupt || player.cash < HOUSE_PRICE) return [];
  return TABLE_SQUARES.flatMap((square, index) => {
    if (square.kind !== "lot" || !ownsGroup(state, seat, index) || state.buildings[index] >= HOTEL) return [];
    // Build evenly: never more than one level ahead of the rest of the set.
    const lowest = Math.min(...lotsInGroup(square.group).map((lot) => state.buildings[lot]));
    return state.buildings[index] === lowest ? [index] : [];
  });
}

/** Cash plus what land and buildings cost to put down. */
export function netWorth(state: TableState, seat: number): number {
  const player = state.seats[seat];
  if (!player || player.bankrupt) return 0;
  return state.owners.reduce<number>(
    (sum, owner, square) => (owner === seat ? sum + LOT_PRICE + state.buildings[square] * HOUSE_PRICE : sum),
    player.cash,
  );
}

/** Seats from richest to poorest; bankrupt seats last, in the order they went out (latest first). */
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

function alive(state: TableState): number[] {
  return state.seats.flatMap((seat, index) => (seat.bankrupt ? [] : [index]));
}

function isOver(state: TableState): boolean {
  const left = alive(state);
  return left.length <= 1 || left.every((seat) => state.seats[seat].turnsTaken >= TURNS_EACH);
}

function withSeat(state: TableState, seat: number, change: Partial<Seat>): TableState {
  return { ...state, seats: state.seats.map((player, index) => (index === seat ? { ...player, ...change } : player)) };
}

/** Pay `amount` from a seat to another seat (or the bank when `to` is null), going bankrupt if short. */
function pay(state: TableState, seat: number, amount: number, to: number | null, events: TableEvent[]): TableState {
  const payer = state.seats[seat];
  if (payer.cash >= amount) {
    let next = withSeat(state, seat, { cash: payer.cash - amount });
    if (to !== null) next = withSeat(next, to, { cash: next.seats[to].cash + amount });
    return next;
  }
  // Short: everything left goes to the creditor, the seat is out, and its land returns to the bank.
  let next = withSeat(state, seat, { cash: 0, bankrupt: true });
  if (to !== null) next = withSeat(next, to, { cash: next.seats[to].cash + payer.cash });
  next = {
    ...next,
    owners: next.owners.map((owner) => (owner === seat ? null : owner)),
    buildings: next.buildings.map((level, square) => (state.owners[square] === seat ? 0 : level)),
  };
  events.push({ kind: "bankrupt", seat, to });
  return next;
}

/** Move a seat forward, paying 1 for passing start. */
function advance(state: TableState, seat: number, steps: number, events: TableEvent[]): TableState {
  const from = state.seats[seat].position;
  const to = (from + steps) % TABLE_SIZE;
  const passedStart = from + steps >= TABLE_SIZE;
  events.push({ kind: "moved", seat, from, to, passedStart });
  return withSeat(state, seat, {
    position: to,
    cash: state.seats[seat].cash + (passedStart ? START_PAY : 0),
  });
}

function sendToJail(state: TableState, seat: number, events: TableEvent[]): TableState {
  events.push({ kind: "jailed", seat });
  return withSeat(state, seat, { position: JAIL_SQUARE, jail: 1 });
}

/** Apply what the square under the seat does, and say which phase follows. */
function land(
  state: TableState,
  seat: number,
  card: number,
  events: TableEvent[],
  depth = 0,
): { state: TableState; phase: TablePhase } {
  const square = state.seats[seat].position;
  const here = TABLE_SQUARES[square];
  if (here.kind === "go-to-jail") return { state: sendToJail(state, seat, events), phase: "act" };
  if (here.kind === "chance" && depth === 0) {
    const drawn = CARDS[((card % CARDS.length) + CARDS.length) % CARDS.length];
    events.push({ kind: "card", seat, card: drawn });
    if (drawn.kind === "money") {
      if (drawn.amount >= 0) return { state: withSeat(state, seat, { cash: state.seats[seat].cash + drawn.amount }), phase: "act" };
      const next = pay(state, seat, -drawn.amount, null, events);
      return { state: next, phase: "act" };
    }
    if (drawn.kind === "jail") return { state: sendToJail(state, seat, events), phase: "act" };
    if (drawn.kind === "to-start") {
      const steps = (TABLE_SIZE - square) % TABLE_SIZE || TABLE_SIZE;
      return { state: advance(state, seat, steps, events), phase: "act" };
    }
    // Step back, then deal with wherever that lands (once).
    const back = (square - drawn.steps + TABLE_SIZE) % TABLE_SIZE;
    events.push({ kind: "moved", seat, from: square, to: back, passedStart: false });
    return land(withSeat(state, seat, { position: back }), seat, card, events, depth + 1);
  }
  if (here.kind !== "lot") return { state, phase: "act" };
  const owner = state.owners[square];
  if (owner === null) {
    return { state, phase: state.seats[seat].cash >= LOT_PRICE ? "buy" : "act" };
  }
  if (owner === seat) return { state, phase: "act" };
  const rent = rentOf(state, square);
  events.push({ kind: "rent", seat, to: owner, amount: Math.min(rent, state.seats[seat].cash) });
  return { state: pay(state, seat, rent, owner, events), phase: "act" };
}

/** Hand the turn to the next seat still playing, or finish the game. */
function nextTurn(state: TableState, events: TableEvent[]): TableState {
  const done = withSeat(state, state.current, { turnsTaken: state.seats[state.current].turnsTaken + 1 });
  if (isOver(done)) return { ...done, phase: "over", events };
  let seat = done.current;
  for (let i = 0; i < done.seats.length; i += 1) {
    seat = (seat + 1) % done.seats.length;
    if (!done.seats[seat].bankrupt && done.seats[seat].turnsTaken < TURNS_EACH) break;
  }
  events.push({ kind: "turn", seat });
  return { ...done, current: seat, phase: "roll", lastDice: null, events };
}

function isFace(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function reduceTable(state: TableState, action: TableAction): TableState {
  if (state.phase === "over") return state;
  const seat = state.current;
  const player = state.seats[seat];
  const events: TableEvent[] = [];
  const bump = (next: TableState): TableState => ({ ...next, events, tick: state.tick + 1 });

  switch (action.type) {
    case "bail": {
      if (state.phase !== "roll" || player.jail === 0 || player.cash < BAIL) return state;
      events.push({ kind: "freed", seat, paid: true });
      return bump(withSeat(state, seat, { cash: player.cash - BAIL, jail: 0 }));
    }
    case "roll": {
      const [a, b] = action.dice ?? [];
      if (state.phase !== "roll" || !isFace(a) || !isFace(b)) return state;
      let next: TableState = { ...state, lastDice: [a, b] };
      if (player.jail > 0) {
        if (a === b) {
          events.push({ kind: "freed", seat, paid: false });
          next = withSeat(next, seat, { jail: 0 });
        } else if (player.jail < MAX_JAIL_TURNS) {
          // Still inside: that was this turn.
          events.push({ kind: "stuck", seat });
          return bump(nextTurn(withSeat(next, seat, { jail: player.jail + 1 }), events));
        } else {
          // Third miss: pay the bail and walk out on this roll.
          events.push({ kind: "freed", seat, paid: true });
          next = pay(next, seat, BAIL, null, events);
          if (next.seats[seat].bankrupt) return bump(nextTurn(next, events));
          next = withSeat(next, seat, { jail: 0 });
        }
      }
      next = advance(next, seat, a + b, events);
      const landed = land(next, seat, action.card ?? 0, events);
      if (landed.state.seats[seat].bankrupt) return bump(nextTurn(landed.state, events));
      return bump({ ...landed.state, phase: landed.phase });
    }
    case "buy": {
      const square = player.position;
      if (state.phase !== "buy" || state.owners[square] !== null || player.cash < LOT_PRICE) return state;
      events.push({ kind: "bought", seat, square });
      const next = withSeat(state, seat, { cash: player.cash - LOT_PRICE });
      return bump({ ...next, owners: next.owners.map((owner, index) => (index === square ? seat : owner)), phase: "act" });
    }
    case "skip": {
      if (state.phase !== "buy") return state;
      return bump({ ...state, phase: "act" });
    }
    case "build": {
      if (state.phase !== "act" || !buildable(state, seat).includes(action.square)) return state;
      const level = state.buildings[action.square] + 1;
      events.push({ kind: "built", seat, square: action.square, level });
      const next = withSeat(state, seat, { cash: player.cash - HOUSE_PRICE });
      return bump({ ...next, buildings: next.buildings.map((value, index) => (index === action.square ? level : value)) });
    }
    case "end-turn": {
      if (state.phase !== "act") return state;
      return bump(nextTurn(state, events));
    }
    default:
      return state;
  }
}

/** A simple computer player: what it does next in the current phase. */
export function botMove(state: TableState, random: () => number): TableAction {
  const seat = state.current;
  const player = state.seats[seat];
  const die = () => 1 + Math.floor(random() * 6);
  if (state.phase === "roll") {
    if (player.jail > 0 && player.cash >= 6) return { type: "bail" };
    return { type: "roll", dice: [die(), die()], card: Math.floor(random() * CARDS.length) };
  }
  if (state.phase === "buy") {
    // Keep a little cash for rent.
    return player.cash - LOT_PRICE >= 2 ? { type: "buy" } : { type: "skip" };
  }
  const options = buildable(state, seat);
  if (options.length > 0 && player.cash - HOUSE_PRICE >= 4) return { type: "build", square: options[0] };
  return { type: "end-turn" };
}
