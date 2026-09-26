"use client";

import { DieFace } from "@/components/die-face";
import { BOARD_ART, TILE_INFO, TILE_POSITIONS } from "@/lib/board";
import { play } from "@/lib/sfx";
import {
  BAIL,
  ENTRY_FEE,
  GROUP_COLOURS,
  HOUSE_CUT,
  HOUSE_PRICE,
  LOT_PRICE,
  RENTS,
  SEASON_POINTS,
  STAKE,
  TABLE_SIZE,
  TABLE_SQUARES,
  TURNS_EACH,
  botMove,
  buildable,
  netWorth,
  newTable,
  reduceTable,
  rentOf,
  standings,
  type TableAction,
  type TableEvent,
  type TableState,
} from "@/lib/table";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const STEP_MS = 200;
const BOT_MS = 750;

/** You and the three computer players, in seat order. */
const CAST = [
  { name: "你", avatar: "/art/avatars/vampire.jpg", colour: "#7C3AED", bot: false },
  { name: "阿殭", avatar: "/art/avatars/jiangshi.jpg", colour: "#2563EB", bot: true },
  { name: "阿木", avatar: "/art/avatars/mummy.jpg", colour: "#D97706", bot: true },
  { name: "阿強", avatar: "/art/avatars/zombie.jpg", colour: "#16A34A", bot: true },
];

function Coin({ className }: { className?: string }) {
  return <img src={TILE_INFO.coin.art} alt="" className={cn("inline-block size-[1.1em] align-[-0.15em]", className)} />;
}

/** Squares nearer the bottom of the art are drawn larger. */
function depthScale(y: number): number {
  return 0.88 + (0.28 * (y - 0.09)) / 0.7;
}

type Walk = { seat: number; from: number; steps: number; step: number; action: TableAction };
type Toast = { key: number; text: string; tone: "good" | "bad" | "info" };

/** A short line for the pop-up, from the latest event worth showing. */
function describe(event: TableEvent, state: TableState): Toast["text"] | null {
  const who = (seat: number) => state.seats[seat]?.name ?? "";
  switch (event.kind) {
    case "rent":
      return `${who(event.seat)} 交租 ${event.amount} → ${who(event.to)}`;
    case "bought": {
      const square = TABLE_SQUARES[event.square];
      return `${who(event.seat)} 買咗${square.kind === "lot" ? square.name : ""}`;
    }
    case "built":
      return `${who(event.seat)} 起咗${event.level >= 4 ? "酒店 🏨" : "屋 🏠"}`;
    case "card":
      return `❓ ${event.card.text}`;
    case "jailed":
      return `${who(event.seat)} 入獄！`;
    case "freed":
      return `${who(event.seat)} 出獄${event.paid ? `（保釋 ${BAIL}）` : "（擲到一對）"}`;
    case "stuck":
      return `${who(event.seat)} 仲喺監獄`;
    case "bankrupt":
      return `${who(event.seat)} 破產！`;
    default:
      return null;
  }
}

function toneOf(event: TableEvent): Toast["tone"] {
  if (event.kind === "rent" || event.kind === "jailed" || event.kind === "bankrupt" || event.kind === "stuck") return "bad";
  if (event.kind === "card" && event.card.kind === "money") return event.card.amount >= 0 ? "good" : "bad";
  if (event.kind === "bought" || event.kind === "built") return "good";
  return "info";
}

function Lobby({ onStart, onExit }: { onStart: (opponents: number) => void; onExit: () => void }) {
  const [opponents, setOpponents] = useState(3);
  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col items-center gap-5 overflow-hidden bg-gradient-to-b from-[#4AA8F5] via-[#8CC63F] to-[#5E9E2B] px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[max(env(safe-area-inset-top),0.75rem)] text-[#1E3A8A]"
      data-testid="table-lobby"
    >
      <header className="flex w-full items-center">
        <button
          type="button"
          onClick={onExit}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-2xl font-black text-white shadow-md"
          aria-label="返回"
        >
          ←
        </button>
        <h1 className="flex-1 text-center text-3xl font-black text-white drop-shadow-[0_3px_0_#1E3A8A]">公開桌</h1>
        <span className="size-11" />
      </header>

      {/* Entry: 20 in, the house keeps 2 as the ticket, 18 goes on the table. */}
      <section className="w-full rounded-3xl border-4 border-[#FBD000] bg-white/95 p-4 shadow-lg" data-testid="entry">
        <div className="flex items-center justify-between text-center font-black">
          <div className="flex flex-col items-center">
            <span className="text-xs text-[#3B5BA9]">入場</span>
            <span className="text-2xl tabular-nums">{ENTRY_FEE}</span>
          </div>
          <span className="text-xl text-[#3B5BA9]">→</span>
          <div className="flex flex-col items-center text-[#E52521]">
            <span className="text-xs">門票</span>
            <span className="text-2xl tabular-nums">−{HOUSE_CUT}</span>
          </div>
          <span className="text-xl text-[#3B5BA9]">→</span>
          <div className="flex flex-col items-center text-[#22A447]">
            <span className="text-xs">落場</span>
            <span className="text-3xl tabular-nums">{STAKE}</span>
          </div>
        </div>
        <p className="mt-2 text-center text-xs font-bold text-[#3B5BA9]">練習局：用分數代替 DST，打完清零</p>
      </section>

      {/* Opponents: pick 1–3 computer players. */}
      <section className="flex w-full flex-col items-center gap-3">
        <div className="flex gap-2">
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setOpponents(count)}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-full border-[3px] px-2 py-1.5 shadow-md",
                opponents === count ? "border-[#FBD000] bg-[#E52521]" : "border-white bg-white/80",
              )}
              aria-label={`${count + 1} 人枱`}
              data-testid={`opponents-${count}`}
            >
              {CAST.slice(1, count + 1).map((seat) => (
                <img key={seat.name} src={seat.avatar} alt="" className="size-8 rounded-full border-2 border-white object-cover" />
              ))}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {CAST.slice(0, opponents + 1).map((seat) => (
            <div key={seat.name} className="flex flex-col items-center">
              <img
                src={seat.avatar}
                alt=""
                className="size-14 rounded-full border-[3px] object-cover shadow-md"
                style={{ borderColor: seat.colour }}
              />
              <span className="-mt-2 rounded-full px-2 text-xs font-black text-white" style={{ background: seat.colour }}>
                {seat.name}
              </span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => onStart(opponents)}
        className="mt-auto h-16 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-3xl font-black tracking-[0.2em] text-white shadow-[0_6px_0_#8E1210] active:translate-y-1 active:shadow-[0_2px_0_#8E1210]"
        data-testid="table-start"
      >
        開枱
      </button>
    </main>
  );
}

function SquareMark({ state, index }: { state: TableState; index: number }) {
  const square = TABLE_SQUARES[index];
  const spot = TILE_POSITIONS[index];
  const scale = depthScale(spot.y);
  const place: CSSProperties = {
    left: `${spot.x * 100}%`,
    top: `${spot.y * 100}%`,
    width: `${9.4 * scale}%`,
    height: `${7.4 * scale}%`,
  };
  const owner = state.owners[index];
  const level = state.buildings[index];
  let tint = "transparent";
  let icon: ReactNode = null;
  if (square.kind === "lot") tint = GROUP_COLOURS[square.group];
  if (square.kind === "chance") {
    tint = "rgba(139,92,246,0.9)";
    icon = <span className="text-[clamp(10px,3vw,16px)] font-black text-white">?</span>;
  }
  if (square.kind === "start") icon = <img src={TILE_INFO.start.art} alt="" className="w-[80%]" />;
  if (square.kind === "jail") icon = <img src={TILE_INFO.jail.art} alt="" className="w-[80%]" />;
  if (square.kind === "parking") icon = <span className="text-[clamp(12px,3.6vw,19px)]">🅿️</span>;
  if (square.kind === "go-to-jail") icon = <span className="text-[clamp(12px,3.6vw,19px)]">👮</span>;
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={place} data-square={index}>
      <span
        className="absolute inset-0 m-auto block aspect-square w-[72%] rounded-[18%] [transform:scaleY(0.78)_rotate(45deg)]"
        style={{
          background: tint,
          boxShadow: owner !== null ? `0 0 0 3px ${state.seats[owner].colour}, 0 0 0 5px white` : undefined,
          opacity: square.kind === "lot" && owner === null ? 0.75 : 1,
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center leading-none">
        {icon}
        {square.kind === "lot" && level > 0 ? (
          <span className="text-[clamp(10px,3vw,16px)] drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
            {level >= 4 ? "🏨" : "🏠".repeat(level)}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** 第二層 公開桌: lobby, the game against computer players, and the final standings. */
export function TableGame({ onExit }: { onExit: () => void }) {
  const [table, setTable] = useState<TableState | null>(null);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const seenTick = useRef(-1);

  const act = useCallback((action: TableAction) => {
    setTable((current) => (current ? reduceTable(current, action) : current));
  }, []);

  /** A roll walks the token square by square first, then applies the roll. */
  const roll = useCallback(
    (action: TableAction) => {
      if (!table || action.type !== "roll") return;
      const seat = table.seats[table.current];
      const [a, b] = action.dice;
      play("roll");
      // In jail without doubles (and not the third try) the token stays put.
      const moves = seat.jail === 0 || a === b || seat.jail >= 3;
      if (!moves) {
        act(action);
        return;
      }
      setWalk({ seat: table.current, from: seat.position, steps: a + b, step: 0, action });
    },
    [table, act],
  );

  // Step the walking token, then commit the roll.
  useEffect(() => {
    if (!walk) return;
    const id = window.setTimeout(() => {
      if (walk.step < walk.steps) {
        play("step");
        setWalk({ ...walk, step: walk.step + 1 });
      } else {
        act(walk.action);
        setWalk(null);
      }
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [walk, act]);

  // Show and sound each batch of events once.
  useEffect(() => {
    if (!table || table.tick === seenTick.current) return;
    seenTick.current = table.tick;
    const shown = [...table.events].reverse().find((event) => describe(event, table) !== null);
    for (const event of table.events) {
      if (event.kind === "rent") play("bad");
      if (event.kind === "bought") play("coin");
      if (event.kind === "built") play("build");
      if (event.kind === "jailed") play("bad");
      if (event.kind === "bankrupt") play("smash");
      if (event.kind === "card") play(event.card.kind === "money" && event.card.amount >= 0 ? "lucky" : "miss");
    }
    if (!shown) return;
    const text = describe(shown, table)!;
    const id = window.setTimeout(() => setToast({ key: table.tick, text, tone: toneOf(shown) }), 0);
    return () => window.clearTimeout(id);
  }, [table]);

  // Each pop-up fades after a moment; a newer one restarts the clock.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Computer players take their turns on their own.
  useEffect(() => {
    if (!table || walk || table.phase === "over" || !table.seats[table.current].bot) return;
    const id = window.setTimeout(() => {
      const move = botMove(table, Math.random);
      if (move.type === "roll") roll(move);
      else act(move);
    }, BOT_MS);
    return () => window.clearTimeout(id);
  }, [table, walk, roll, act]);

  if (!table) {
    return (
      <Lobby
        onExit={onExit}
        onStart={(opponents) => {
          seenTick.current = -1;
          setTable(newTable(CAST.slice(0, opponents + 1)));
        }}
      />
    );
  }

  const me = table.seats[0];
  const mine = table.current === 0 && !walk && table.phase !== "over";
  const here = TABLE_SQUARES[me.position];
  const buildOptions = mine && table.phase === "act" ? buildable(table, 0) : [];
  const shownPosition = (seat: number) =>
    walk && walk.seat === seat ? (walk.from + walk.step) % TABLE_SIZE : table.seats[seat].position;
  const round = Math.min(TURNS_EACH, me.turnsTaken + (me.bankrupt ? 0 : 1));

  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#4AA8F5] via-[#8CC63F] to-[#5E9E2B] text-[#1E3A8A] [container-type:size]"
      data-testid="table"
    >
      {/* Players: face, cash, whose turn. */}
      <header className="relative z-10 flex items-start justify-between gap-1 px-2 pt-[max(env(safe-area-inset-top),0.6rem)]">
        {table.seats.map((seat, index) => (
          <div
            key={seat.name}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center rounded-2xl border-[3px] bg-white/90 py-1 shadow-md transition-transform",
              table.current === index && table.phase !== "over" ? "scale-105 border-[#FBD000]" : "border-transparent",
              seat.bankrupt && "opacity-40 grayscale",
            )}
            data-testid={`seat-${index}`}
          >
            <img src={seat.avatar} alt="" className="size-9 rounded-full border-[3px] object-cover" style={{ borderColor: seat.colour }} />
            <span className="text-[11px] font-black leading-tight">{seat.name}</span>
            <span key={seat.cash} className="flex items-center gap-0.5 text-sm font-black tabular-nums animate-[bump_0.35s_ease-out]">
              <Coin />
              {seat.cash}
            </span>
            {seat.jail > 0 ? <span className="text-xs">🔒</span> : null}
          </div>
        ))}
      </header>
      <p className="relative z-10 mt-1 text-center text-xs font-black text-white drop-shadow" data-testid="round">
        第 {round}／{TURNS_EACH} 轉
      </p>

      {/* The board, fitted to the space between the bars. */}
      <section className="relative flex min-h-0 flex-1 items-center justify-center">
        <div
          className="relative aspect-square bg-contain bg-center bg-no-repeat drop-shadow-[0_10px_14px_rgba(20,70,20,0.35)]"
          style={{ backgroundImage: `url(${BOARD_ART})`, width: "min(100cqw, 60cqh)" }}
        >
          {TABLE_SQUARES.map((_, index) => (
            <SquareMark key={index} state={table} index={index} />
          ))}
          {table.seats.map((seat, index) => {
            if (seat.bankrupt) return null;
            const spot = TILE_POSITIONS[shownPosition(index)];
            const sharing = table.seats.filter((other, i) => !other.bankrupt && shownPosition(i) === shownPosition(index));
            const offset = sharing.indexOf(seat) - (sharing.length - 1) / 2;
            return (
              <div
                key={seat.name}
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[85%] transition-[left,top] duration-200 ease-out"
                style={{ left: `calc(${spot.x * 100}% + ${offset * 12}px)`, top: `${spot.y * 100}%` }}
              >
                <img
                  key={walk?.seat === index ? walk.step : 0}
                  src={seat.avatar}
                  alt=""
                  className="size-[clamp(24px,7.5vw,38px)] rounded-full border-[3px] object-cover shadow-md animate-[hop_0.22s_ease-out]"
                  style={{ borderColor: seat.colour }}
                />
              </div>
            );
          })}
          {/* Dice in the middle while rolling. */}
          {table.lastDice || walk ? (
            <div className="absolute left-1/2 top-[44%] flex -translate-x-1/2 -translate-y-1/2 gap-1">
              <DieFace value={walk && walk.action.type === "roll" ? walk.action.dice[0] : (table.lastDice?.[0] ?? null)} />
              <DieFace value={walk && walk.action.type === "roll" ? walk.action.dice[1] : (table.lastDice?.[1] ?? null)} />
            </div>
          ) : null}
        </div>
      </section>

      {toast ? (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-30 flex justify-center">
          <p
            key={toast.key}
            className={cn(
              "animate-[pop_0.3s_ease-out] rounded-full border-[3px] border-[#FBD000] px-5 py-2 text-lg font-black text-white shadow-xl",
              toast.tone === "bad" ? "bg-[#46506E]" : toast.tone === "good" ? "bg-[#22A447]" : "bg-[#049CD8]",
            )}
            data-testid="table-toast"
          >
            {toast.text}
          </p>
        </div>
      ) : null}

      {/* What you can do now. */}
      <footer className="relative z-10 flex min-h-28 items-center justify-center gap-3 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-3 shadow-[0_-6px_20px_rgba(30,58,138,0.25)]">
        {table.phase === "over" ? null : !mine ? (
          <div className="flex items-center gap-2 font-black">
            <img
              src={table.seats[table.current].avatar}
              alt=""
              className="size-10 rounded-full border-[3px] object-cover"
              style={{ borderColor: table.seats[table.current].colour }}
            />
            <span className="animate-pulse text-lg">⋯</span>
          </div>
        ) : table.phase === "roll" ? (
          <>
            {me.jail > 0 && me.cash >= BAIL ? (
              <button
                type="button"
                onClick={() => act({ type: "bail" })}
                className="flex h-14 cursor-pointer items-center gap-1 rounded-full border-4 border-[#FBD000] bg-[#049CD8] px-4 text-lg font-black text-white shadow-[0_4px_0_#1E3A8A]"
                data-testid="bail"
              >
                🔓 <Coin />
                {BAIL}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                const die = () => 1 + Math.floor(Math.random() * 6);
                roll({ type: "roll", dice: [die(), die()], card: Math.floor(Math.random() * 100) });
              }}
              className="size-24 cursor-pointer rounded-full border-[6px] border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-4xl font-black text-white shadow-[0_6px_0_#8E1210] animate-[glow_1.8s_ease-in-out_infinite] active:translate-y-1"
              aria-label="擲骰"
              data-testid="table-roll"
            >
              GO
            </button>
          </>
        ) : table.phase === "buy" && here.kind === "lot" ? (
          <div className="flex w-full items-center gap-3" data-testid="buy-offer">
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border-2 border-[#D6DEEA]">
              <span className="h-3" style={{ background: GROUP_COLOURS[here.group] }} />
              <span className="px-2 py-1 text-lg font-black">{here.name}</span>
              <span className="flex items-center gap-1 px-2 pb-1 text-sm font-bold text-[#3B5BA9]">
                <Coin />
                {LOT_PRICE} · 租 {rentOf(table, me.position)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => act({ type: "skip" })}
              className="size-14 cursor-pointer rounded-full border-4 border-[#D6DEEA] bg-white text-2xl font-black text-[#46506E]"
              aria-label="唔買"
              data-testid="skip"
            >
              ✕
            </button>
            <button
              type="button"
              onClick={() => act({ type: "buy" })}
              className="size-16 cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#22A447] text-3xl font-black text-white shadow-[0_4px_0_#15803D]"
              aria-label={`買，${LOT_PRICE} 金幣`}
              data-testid="buy"
            >
              ✓
            </button>
          </div>
        ) : (
          <>
            {buildOptions.length > 0 ? (
              <button
                type="button"
                onClick={() => setBuildOpen(true)}
                className="flex h-14 cursor-pointer items-center gap-1 rounded-full border-4 border-[#FBD000] bg-[#43B047] px-4 text-xl font-black text-white shadow-[0_4px_0_#2E8B3E]"
                data-testid="table-build"
              >
                🏠 <Coin />
                {HOUSE_PRICE}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => act({ type: "end-turn" })}
              className="h-14 cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#049CD8] px-8 text-2xl font-black text-white shadow-[0_4px_0_#1E3A8A] active:translate-y-1"
              aria-label="完成"
              data-testid="end-turn"
            >
              ✓
            </button>
          </>
        )}
      </footer>

      {/* Build sheet: every lot you can add to, with its level now. */}
      {buildOpen && buildOptions.length > 0 ? (
        <div className="absolute inset-0 z-40 flex items-end bg-[#1E3A8A]/50" onClick={() => setBuildOpen(false)}>
          <div
            className="grid w-full grid-cols-3 gap-2 rounded-t-[32px] bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            data-testid="build-sheet"
          >
            {buildOptions.map((square) => {
              const lot = TABLE_SQUARES[square];
              const level = table.buildings[square];
              return (
                <button
                  key={square}
                  type="button"
                  disabled={me.cash < HOUSE_PRICE}
                  onClick={() => {
                    act({ type: "build", square });
                    setBuildOpen(false);
                  }}
                  className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border-[3px] border-[#FBD000] bg-[#FFF8D6] text-center disabled:opacity-50"
                >
                  <span className="h-3" style={{ background: lot.kind === "lot" ? GROUP_COLOURS[lot.group] : undefined }} />
                  <span className="py-1 text-sm font-black">{lot.kind === "lot" ? lot.name : ""}</span>
                  <span className="text-lg">{level >= 3 ? "🏨" : "🏠".repeat(level + 1)}</span>
                  <span className="pb-1 text-xs font-bold text-[#3B5BA9]">租 {rentOf(table, square)} → {RENTS[level + 1]}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Final standings. */}
      {table.phase === "over" ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#1E3A8A]/70 px-5" data-testid="table-over">
          <div className="w-full animate-[pop_0.4s_ease-out] rounded-[32px] border-4 border-[#FBD000] bg-white p-4 shadow-2xl">
            <h2 className="mb-3 text-center text-2xl font-black">🏆 結果</h2>
            <ol className="space-y-2">
              {standings(table).map((seat, place) => {
                const player = table.seats[seat];
                return (
                  <li
                    key={seat}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border-2 px-2 py-1.5",
                      seat === 0 ? "border-[#FBD000] bg-[#FFF8D6]" : "border-[#E5EAF2]",
                    )}
                  >
                    <span className="w-7 text-center text-xl">{["🥇", "🥈", "🥉", "4"][place]}</span>
                    <img src={player.avatar} alt="" className="size-10 rounded-full border-[3px] object-cover" style={{ borderColor: player.colour }} />
                    <span className="flex-1 font-black">{player.name}</span>
                    <span className="flex items-center gap-0.5 font-black tabular-nums">
                      <Coin />
                      {netWorth(table, seat)}
                    </span>
                    <span className="rounded-full bg-[#1E3A8A] px-2 text-xs font-black text-white">
                      +{SEASON_POINTS[table.seats.length]?.[place] ?? 0} 分
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onExit}
                className="h-12 cursor-pointer rounded-full border-4 border-[#D6DEEA] bg-white text-lg font-black"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => setTable(null)}
                className="h-12 cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#E52521] text-lg font-black text-white"
                data-testid="table-again"
              >
                再嚟一局
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
