"use client";

import { createBoardScene, loadThree, type BoardScene } from "@/components/eight-scene";
import { TILE_INFO } from "@/lib/board";
import {
  BAIL,
  ENTRY_FEE,
  HOUSE_CUT,
  JAIL,
  SEASON_POINTS,
  STAKE,
  START_PAY,
  TURNS_EACH,
  botMove,
  netWorth,
  newTable,
  reduceTable,
  standings,
  type TableAction,
  type TableEvent,
  type TableState,
} from "@/lib/eight";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";

/** You and the three computer players, in seat order. */
const CAST = [
  { name: "你", avatar: "/art/avatars/vampire.jpg", colour: "#7C3AED", bot: false },
  { name: "阿殭", avatar: "/art/avatars/jiangshi.jpg", colour: "#2563EB", bot: true },
  { name: "阿木", avatar: "/art/avatars/mummy.jpg", colour: "#D97706", bot: true },
  { name: "阿強", avatar: "/art/avatars/zombie.jpg", colour: "#16A34A", bot: true },
];

type Player = (typeof CAST)[number];

function Coin({ className }: { className?: string }) {
  return <img src={TILE_INFO.coin.art} alt="" className={cn("inline-block size-[1.1em] align-[-0.15em]", className)} />;
}

function Lobby({ onStart, onExit }: { onStart: (opponents: number) => void; onExit: () => void }) {
  const { t } = useLang();
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
          aria-label={t("返回")}
        >
          ←
        </button>
        <h1 className="flex-1 text-center text-3xl font-black text-white drop-shadow-[0_3px_0_#1E3A8A]">{t("公開桌")}</h1>
        <span className="size-11" />
      </header>

      {/* Entry: 20 in, the house keeps 2 as the ticket, 18 goes on the table. */}
      <section className="w-full rounded-3xl border-4 border-[#FBD000] bg-white/95 p-4 shadow-lg" data-testid="entry">
        <div className="flex items-center justify-between text-center font-black">
          <div className="flex flex-col items-center">
            <span className="text-xs text-[#3B5BA9]">{t("入場")}</span>
            <span className="text-2xl tabular-nums">{ENTRY_FEE}</span>
          </div>
          <span className="text-xl text-[#3B5BA9]">→</span>
          <div className="flex flex-col items-center text-[#E52521]">
            <span className="text-xs">{t("門票")}</span>
            <span className="text-2xl tabular-nums">−{HOUSE_CUT}</span>
          </div>
          <span className="text-xl text-[#3B5BA9]">→</span>
          <div className="flex flex-col items-center text-[#22A447]">
            <span className="text-xs">{t("落場")}</span>
            <span className="text-3xl tabular-nums">{STAKE}</span>
          </div>
        </div>
        <p className="mt-2 text-center text-xs font-bold text-[#3B5BA9]">{t("練習局：用分數代替 DST，打完清零")}</p>
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
              aria-label={t("{n} 人枱", { n: count + 1 })}
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
                {t(seat.name)}
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
        {t("開枱")}
      </button>
    </main>
  );
}


/** 第二層 公開桌: lobby, then the 八字 board in 3D against computer players, then the standings. */
export function TableGame({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<{ id: number; players: Player[] } | null>(null);
  if (!game) {
    return <Lobby onExit={onExit} onStart={(opponents) => setGame({ id: Date.now(), players: CAST.slice(0, opponents + 1) })} />;
  }
  return <EightBoard key={game.id} players={game.players} onExit={onExit} onAgain={() => setGame(null)} />;
}

type Toast = { key: number; text: string };

/** Seconds of doing nothing on your turn before the game rolls for you. */
const AUTO_SECONDS = 5;
const rollFace = () => 1 + Math.floor(Math.random() * 6);

function EightBoard({ players, onExit, onAgain }: { players: Player[]; onExit: () => void; onAgain: () => void }) {
  const [table, setTable] = useState<TableState>(() => newTable(players));
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(true);
  const [fast, setFast] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [wide, setWide] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const { t } = useLang();
  const tRef = useRef(t);
  tRef.current = t;
  const wideRef = useRef(false);
  const mount = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const stateRef = useRef<TableState>(table);
  const running = useRef(false);
  const fastRef = useRef(false);
  const toastKey = useRef(0);

  /** Show a line, translated into the current language. */
  const say = useCallback((text: string, vars?: Record<string, string | number>) => {
    toastKey.current += 1;
    setToast({ key: toastKey.current, text: tRef.current(text, vars) });
  }, []);

  /** Close in on a seat, unless 睇全枱 is on: then the camera stays wide for the rest of the game. */
  const aim = useCallback((scene: BoardScene, seat: number) => scene.focus(wideRef.current ? null : seat), []);

  // Each pop-up fades after a moment; a newer one restarts the clock.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1500);
    return () => window.clearTimeout(id);
  }, [toast]);

  /** x1 or x2 for everyone, you included. */
  const speedFor = useCallback(() => (fastRef.current ? 2 : 1), []);

  /** Play a move's events on the board, one after another. */
  const playEvents = useCallback(
    async (scene: BoardScene, events: TableEvent[], state: TableState) => {
      const who = (seat: number) => tRef.current(state.seats[seat]?.name ?? "");
      for (const event of events) {
        if (sceneRef.current !== scene) return;
        switch (event.kind) {
          case "turn":
            scene.hideDice();
            await scene.wait(1000);
            scene.focus(null);
            await scene.wait(900);
            scene.setSpeed(speedFor());
            aim(scene, event.seat);
            say("輪到 {name}", { name: who(event.seat) });
            await scene.wait(700);
            break;
          case "freed":
            say("{name} 付 {n} 保釋出獄", { name: who(event.seat), n: BAIL });
            await scene.wait(800);
            break;
          case "step":
            await scene.stepTo(event.seat, event.to);
            play("step");
            if (event.passedStart) {
              play("coin");
              say("經過起點 +{n}", { n: START_PAY });
              void scene.coinsBurst(event.seat, 2);
            }
            break;
          case "fork":
            say(state.seats[event.seat]?.bot ? "{name} 喺分岔路口" : "揀路", { name: who(event.seat) });
            break;
          case "bought":
            play("coin");
            say("{name} 買地起樓 −{n}", { name: who(event.seat), n: event.price });
            await Promise.all([scene.own(event.key, event.seat, 1), scene.pulse(event.seat)]);
            break;
          case "upgraded":
            play("build");
            say(event.level >= 4 ? "{name} 起咗地標！" : "{name} 升到第 {n} 級", { name: who(event.seat), n: event.level });
            await Promise.all([scene.own(event.key, event.seat, event.level), scene.pulse(event.seat, true)]);
            if (event.level >= 4) await scene.coinsBurst(event.seat, 4);
            break;
          case "rent":
            play("bad");
            say("{name} 交租 {n} 俾 {owner}", { name: who(event.seat), n: event.amount, owner: who(event.to) });
            await scene.coinsFly(event.seat, event.to, event.amount);
            break;
          case "bonus":
            play(event.reason === "chest" ? "chest" : "coin");
            say(event.reason === "chest" ? "{name} 開寶箱 +{n}" : "{name} 十字路口 +{n}", { name: who(event.seat), n: event.amount });
            await scene.coinsBurst(event.seat, event.amount);
            break;
          case "tax":
            play("bad");
            say("{name} 交稅 −{n}", { name: who(event.seat), n: event.amount });
            await scene.coinsFly(event.seat, null, event.amount);
            break;
          case "card": {
            const good = event.card.kind === "money" ? event.card.amount >= 0 : event.card.kind === "forward";
            play(good ? "lucky" : "miss");
            say("❓ {text}", { text: tRef.current(event.card.text) });
            await scene.wait(900);
            if (event.card.kind === "money" && event.card.amount > 0) await scene.coinsBurst(event.seat, event.card.amount);
            break;
          }
          case "fly":
            say("{name} 坐飛機！", { name: who(event.seat) });
            await scene.wait(400);
            await scene.flyTo(event.seat, event.to);
            break;
          case "jailed":
            play("bad");
            say("{name} 入獄！", { name: who(event.seat) });
            await scene.flyTo(event.seat, { on: "loop", i: JAIL });
            break;
          case "bankrupt":
            play("smash");
            say("{name} 破產！", { name: who(event.seat) });
            scene.removeToken(event.seat);
            event.lost.forEach((key) => scene.clear(key));
            await scene.wait(900);
            break;
        }
      }
    },
    [say, speedFor, aim],
  );

  /** Apply a move, play it on the board, then show the new state. */
  const run = useCallback(
    async (action: TableAction) => {
      const scene = sceneRef.current;
      const before = stateRef.current;
      if (!scene || running.current) return;
      const next = reduceTable(before, action);
      if (next === before) return;
      running.current = true;
      setBusy(true);
      stateRef.current = next;
      if (action.type === "roll" && next.lastDice) {
        play("roll");
        await scene.roll(before.current, next.lastDice);
        const [a, b] = next.lastDice;
        say(a === b ? "擲出 {n}，孖寶！" : "擲出 {n}", { n: a + b });
        await scene.wait(350);
      }
      await playEvents(scene, next.events, next);
      if (sceneRef.current !== scene) return;
      if (next.phase === "over") {
        scene.hideDice();
        scene.focus(null);
      }
      running.current = false;
      setTable(next);
      setBusy(false);
    },
    [playEvents, say],
  );

  // Load three.js and build the board once.
  useEffect(() => {
    let cancelled = false;
    let scene: BoardScene | null = null;
    loadThree()
      .then((T) => {
        if (cancelled || !mount.current) return;
        scene = createBoardScene(T, mount.current, stateRef.current.seats.map((seat) => seat.colour));
        sceneRef.current = scene;
        setLoaded("ready");
        aim(scene, stateRef.current.current);
        say("輪到 {name}", { name: tRef.current(stateRef.current.seats[stateRef.current.current].name) });
        setBusy(false);
      })
      .catch(() => {
        if (!cancelled) setLoaded("failed");
      });
    return () => {
      cancelled = true;
      if (sceneRef.current === scene) sceneRef.current = null;
      scene?.dispose();
    };
  }, [say, aim]);

  // Computer players move on their own.
  useEffect(() => {
    if (loaded !== "ready" || busy || table.phase === "over" || !table.seats[table.current].bot) return;
    const id = window.setTimeout(() => void run(botMove(stateRef.current, Math.random)), 450);
    return () => window.clearTimeout(id);
  }, [loaded, busy, table, run]);

  /** 睇全枱 keeps the camera wide for the rest of the game; 跟住睇 goes back to following. */
  const toggleWide = () => {
    wideRef.current = !wideRef.current;
    setWide(wideRef.current);
    const scene = sceneRef.current;
    if (scene) aim(scene, stateRef.current.current);
  };

  const toggleFast = () => {
    fastRef.current = !fastRef.current;
    setFast(fastRef.current);
    sceneRef.current?.setSpeed(speedFor());
  };

  // Your turn and you haven't moved for 5 seconds: roll for you (at a fork, keep to the loop).
  const waiting = loaded === "ready" && !busy && table.phase !== "over" && table.current === 0 && !table.seats[0].bankrupt;
  useEffect(() => {
    if (!waiting) {
      setCountdown(null);
      return;
    }
    let left = AUTO_SECONDS;
    setCountdown(left);
    const id = window.setInterval(() => {
      left -= 1;
      if (left > 0) {
        setCountdown(left);
        return;
      }
      window.clearInterval(id);
      setCountdown(null);
      const now = stateRef.current;
      if (now.phase === "fork") void run({ type: "choose", road: false });
      else void run({ type: "roll", dice: [rollFace(), rollFace()], card: Math.floor(Math.random() * 1000), fly: Math.floor(Math.random() * 1000) });
    }, 1000);
    return () => window.clearInterval(id);
  }, [waiting, table.tick, run]);

  const me = table.seats[0];
  const mine = !busy && loaded === "ready" && table.current === 0 && table.phase !== "over" && !me.bankrupt;
  const round = Math.min(TURNS_EACH, me.turnsTaken + (me.bankrupt ? 0 : 1));

  return (
    <main className="relative h-dvh w-full touch-none select-none overflow-hidden bg-[#3B1D6E] text-[#1E3A8A]" data-testid="table">
      <div ref={mount} className="absolute inset-0" aria-label={t("兩個菱形砌成八字嘅立體棋盤")} />

      {/* Players: face, cash, whose turn. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-xl flex-col gap-1 px-2 pt-[max(env(safe-area-inset-top),0.6rem)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-xl font-black text-white shadow-md"
            aria-label={t("返回")}
          >
            ←
          </button>
          <p className="flex-1 text-center text-sm font-black text-white drop-shadow" data-testid="round">
            {t("第 {n}／{total} 轉", { n: round, total: TURNS_EACH })}
          </p>
          <span className="size-10" />
        </div>
        <div className="flex items-start justify-between gap-1">
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
              <span className="text-[11px] font-black leading-tight">{t(seat.name)}</span>
              <span key={seat.cash} className="flex items-center gap-0.5 text-sm font-black tabular-nums animate-[bump_0.35s_ease-out]">
                <Coin />
                {seat.cash}
              </span>
              {seat.jailed ? <span className="text-xs">🔒</span> : null}
            </div>
          ))}
        </div>
      </header>

      {loaded !== "ready" ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-4 text-center font-black text-white">
          {loaded === "loading" ? (
            <p className="animate-pulse text-lg">{t("載入立體棋盤⋯")}</p>
          ) : (
            <>
              <p className="text-lg">{t("立體畫面載入唔到，請檢查網絡再試。")}</p>
              <button
                type="button"
                onClick={onAgain}
                className="cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#E52521] px-6 py-2 text-lg font-black text-white"
              >
                {t("再試")}
              </button>
            </>
          )}
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute inset-x-0 top-[24%] z-30 flex justify-center px-4">
          <p
            key={toast.key}
            className="animate-[pop_0.3s_ease-out] whitespace-nowrap rounded-full border-[3px] border-[#FBD000] bg-[#1E3A8A] px-5 py-2 text-lg font-black text-white shadow-xl"
            data-testid="table-toast"
            role="status"
          >
            {toast.text}
          </p>
        </div>
      ) : null}

      {/* At a fork: go round the loop or take the gold inner road. */}
      {mine && table.phase === "fork" ? (
        <div className="absolute inset-x-0 top-[36%] z-30 flex justify-center gap-3 px-4" data-testid="fork-choice">
          <button
            type="button"
            onClick={() => void run({ type: "choose", road: false })}
            className="cursor-pointer rounded-full border-4 border-[#FBD000] bg-white px-5 py-3 text-lg font-black text-[#1E3A8A] shadow-[0_6px_0_#C9A700]"
          >
            {t("⟳ 行外圈")}
          </button>
          <button
            type="button"
            onClick={() => void run({ type: "choose", road: true })}
            className="cursor-pointer rounded-full border-4 border-[#FBD000] bg-gradient-to-b from-[#FFE066] to-[#F2C230] px-5 py-3 text-lg font-black text-[#1E3A8A] shadow-[0_6px_0_#C9A700]"
          >
            {t("⇢ 抄內路")}
          </button>
        </div>
      ) : null}

      {/* Controls. */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-xl items-end justify-between px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <button
          type="button"
          onClick={toggleFast}
          aria-label={t("速度 {n} 倍，撳一下轉", { n: fast ? 2 : 1 })}
          className={cn(
            "pointer-events-auto min-w-14 cursor-pointer rounded-full border-[3px] border-[#FBD000] px-4 py-2 text-base font-black tabular-nums text-white",
            fast ? "bg-[#16A34A] shadow-[0_4px_0_#0D5F2B]" : "bg-[#1E3A8A] shadow-[0_4px_0_#0F1F4D]",
          )}
        >
          {fast ? "x2" : "x1"}
        </button>
        <button
          type="button"
          disabled={!mine || table.phase !== "roll"}
          onClick={() => void run({ type: "roll", dice: [rollFace(), rollFace()], card: Math.floor(Math.random() * 1000), fly: Math.floor(Math.random() * 1000) })}
          className="pointer-events-auto size-24 cursor-pointer rounded-full border-[6px] border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-2xl font-black text-white shadow-[0_6px_0_#8E1210] active:translate-y-1 disabled:cursor-default disabled:opacity-50 enabled:animate-[glow_1.8s_ease-in-out_infinite]"
          aria-label={countdown !== null ? t("{n} 秒後自動擲骰", { n: countdown }) : t("擲骰")}
          data-testid="table-roll"
        >
          <span className="flex flex-col items-center leading-none">
            {t("擲骰")}
            {countdown !== null && table.phase === "roll" ? <span className="mt-1 text-base tabular-nums">{countdown}</span> : null}
          </span>
        </button>
        <button
          type="button"
          onClick={toggleWide}
          aria-pressed={wide}
          className="pointer-events-auto cursor-pointer rounded-full border-[3px] border-[#FBD000] bg-[#1E3A8A] px-4 py-2 text-sm font-black text-white shadow-[0_4px_0_#0F1F4D]"
        >
          {wide ? t("跟住睇") : t("睇全枱")}
        </button>
      </footer>

      {/* Final standings. */}
      {table.phase === "over" ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#1E3A8A]/70 px-5" data-testid="table-over">
          <div className="w-full animate-[pop_0.4s_ease-out] rounded-[32px] border-4 border-[#FBD000] bg-white p-4 shadow-2xl">
            <h2 className="mb-3 text-center text-2xl font-black">{t("🏆 結果")}</h2>
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
                    <span className="flex-1 font-black">{t(player.name)}</span>
                    <span className="flex items-center gap-0.5 font-black tabular-nums">
                      <Coin />
                      {netWorth(table, seat)}
                    </span>
                    <span className="rounded-full bg-[#1E3A8A] px-2 text-xs font-black text-white">
                      {t("+{n} 分", { n: SEASON_POINTS[table.seats.length]?.[place] ?? 0 })}
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
                onClick={onAgain}
                className="h-12 cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#E52521] text-lg font-black text-white"
                data-testid="table-again"
              >
                {t("再嚟一局")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
