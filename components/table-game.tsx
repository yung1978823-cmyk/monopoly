"use client";

import { ACTORS, createBoardScene, loadThree, type BoardScene, type Decor } from "@/components/eight-scene";
import { TILE_INFO } from "@/lib/board";
import {
  BUY_RESERVE,
  BAIL,
  ENTRY_FEE,
  HOUSE_CUT,
  JAIL,
  SEASON_POINTS,
  STAKE,
  START_PAY,
  botMove,
  canPlay,
  type Power,
  netWorth,
  newTable,
  reduceTable,
  standings,
  type TableAction,
  type TableEvent,
  type BoardId,
  type TableRules,
  type TableState,
} from "@/lib/eight";
import { LAND_TAX, hostReport, tableReward, type Realm, type Stock } from "@/lib/realm";
import { addStock } from "@/lib/realm";
import { loadWallet, saveWallet } from "@/components/wallet-store";
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
  // Two more guests so a 領地 can seat six; no drawn faces yet, so they show an emoji.
  { name: "阿狼", avatar: "", colour: "#DB2777", bot: true },
  { name: "阿鬼", avatar: "", colour: "#0891B2", bot: true },
  { name: "阿蝠", avatar: "", colour: "#9333EA", bot: true },
];
const EMOJI: Record<string, string> = { 阿狼: "🐺", 阿鬼: "👻", 阿蝠: "🦇" };

/**
 * The four 3D characters a player can be. First come, first served: once you take one, the computer
 * players get the others (with real players later, a character someone has taken is greyed out).
 */
const CHARACTERS = [
  { name: "伯爵", avatar: "/art/avatars/vampire.jpg", colour: "#7C3AED" },
  { name: "阿殭", avatar: "/art/avatars/jiangshi.jpg", colour: "#2563EB" },
  { name: "阿木", avatar: "/art/avatars/mummy.jpg", colour: "#D97706" },
  { name: "阿強", avatar: "/art/avatars/zombie.jpg", colour: "#16A34A" },
];
const PICK_KEY = "boolionaire-character";

/** You as the character you picked, then the computer players as the characters left over. */
function seatsFor(pick: number, opponents: number): Player[] {
  const mine = CHARACTERS[pick] ?? CHARACTERS[0];
  const rest = CHARACTERS.filter((_, i) => i !== pick).map((c) => ({ ...c, bot: true }));
  return [{ name: "你", avatar: mine.avatar, colour: mine.colour, bot: false }, ...rest].slice(0, opponents + 1);
}

function savedPick(): number {
  try {
    const n = Number(window.localStorage.getItem(PICK_KEY));
    return Number.isInteger(n) && n >= 0 && n < CHARACTERS.length ? n : 0;
  } catch {
    return 0;
  }
}

/** The 3D character for a seat, from its avatar picture (vampire, jiangshi, mummy, zombie), or null. */
function actorOf(avatar: string): string | null {
  const key = /avatars\/(\w+)\./.exec(avatar)?.[1];
  return key && ACTORS[key] ? key : null;
}

/** When each character does its special move: the vampire bows when paid rent, 阿殭 casts a spell on
 * a chance card, 阿木 raises his shield when he has to pay, 阿強 swings his hammer when he builds. */
const SPECIAL_WHEN: Record<string, "paid" | "card" | "pays" | "builds"> = {
  vampire: "paid",
  jiangshi: "card",
  mummy: "pays",
  zombie: "builds",
};

/** 功能卡 names, icons and what they do, for the hand and the messages. */
const POWER_INFO: Record<Power, { name: string; icon: string; what: string }> = {
  boost: { name: "全城加建", icon: "🏗️", what: "自己全部地升一級" },
  lock: { name: "封地", icon: "🔒", what: "對手最好嗰塊地兩轉收唔到租" },
  wreck: { name: "拆樓", icon: "💣", what: "對手最好嗰塊地降一級" },
  swap: { name: "換位", icon: "🔄", what: "同一個對手交換位置" },
  shield: { name: "免租牌", icon: "🛡️", what: "下次交租唔使俾（自動用）" },
};

/** A player's face: the drawn avatar, or an emoji in a coloured circle. */
function Face({ seat, className }: { seat: { name: string; avatar: string; colour: string }; className?: string }) {
  if (seat.avatar) {
    return <img src={seat.avatar} alt="" className={cn("rounded-full object-cover", className)} style={{ borderColor: seat.colour }} />;
  }
  return (
    <span className={cn("flex items-center justify-center rounded-full", className)} style={{ borderColor: seat.colour, background: seat.colour }} aria-hidden>
      {EMOJI[seat.name] ?? "🙂"}
    </span>
  );
}

export type Player = (typeof CAST)[number];
export { CAST };

/** Paper confetti falling over the results when you win. */
function Confetti() {
  const colours = ["#FBD000", "#E52521", "#22C55E", "#3B82F6", "#EC4899", "#F97316"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 40 }, (_, n) => (
        <span
          key={n}
          className="absolute top-0 block h-3 w-2 rounded-sm"
          style={{
            left: `${(n * 37) % 100}%`,
            background: colours[n % colours.length],
            animation: `confetti ${2.2 + ((n * 7) % 10) / 6}s linear ${((n * 13) % 20) / 10}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function Coin({ className }: { className?: string }) {
  return <img src={TILE_INFO.coin.art} alt="" className={cn("inline-block size-[1.1em] align-[-0.15em]", className)} />;
}

function Lobby({ onStart, onExit }: { onStart: (players: Player[]) => void; onExit: () => void }) {
  const { t } = useLang();
  const [opponents, setOpponents] = useState(3);
  const [pick, setPick] = useState(0);
  useEffect(() => setPick(savedPick()), []);
  const choose = (i: number) => {
    setPick(i);
    try {
      window.localStorage.setItem(PICK_KEY, String(i));
    } catch {
      // Remembering the pick is only a convenience.
    }
  };
  const seats = seatsFor(pick, opponents);
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

      {/* Your character: first come, first served; the computer players get the rest. */}
      <section className="w-full rounded-3xl bg-white/90 p-3 shadow-lg" data-testid="character-pick">
        <h2 className="mb-2 text-center text-sm font-black">{t("揀你嘅角色")}</h2>
        <div className="grid grid-cols-4 gap-2">
          {CHARACTERS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onClick={() => choose(i)}
              aria-pressed={pick === i}
              className={cn(
                "flex cursor-pointer flex-col items-center rounded-2xl border-[3px] p-1.5 transition",
                pick === i ? "scale-105 border-[#FBD000] bg-[#FFF8D6] shadow-md" : "border-transparent opacity-70",
              )}
              data-testid={`character-${i}`}
            >
              <Face seat={c} className="size-12 border-[3px]" />
              <span className="mt-1 text-xs font-black">{t(c.name)}</span>
              {pick === i ? <span className="text-[10px] font-black text-[#E52521]">{t("你揀咗")}</span> : null}
            </button>
          ))}
        </div>
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
              {seatsFor(pick, count).slice(1).map((seat) => (
                <Face key={seat.name} seat={seat} className="size-8 border-2 border-white" />
              ))}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {seats.map((seat) => (
            <div key={seat.name} className="flex flex-col items-center">
              <Face seat={seat} className="size-14 border-[3px] text-3xl shadow-md" />
              <span className="-mt-2 rounded-full px-2 text-xs font-black text-white" style={{ background: seat.colour }}>
                {t(seat.name)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => onStart(seats)}
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
    return <Lobby onExit={onExit} onStart={(players) => setGame({ id: Date.now(), players })} />;
  }
  return <EightBoard key={game.id} players={game.players} onExit={onExit} onAgain={() => setGame(null)} />;
}

type Toast = { key: number; text: string };

/** Seconds of doing nothing on your turn before the game rolls for you. */
const AUTO_SECONDS = 5;
const rollFace = () => 1 + Math.floor(Math.random() * 6);

/**
 * The 八字 board game itself. On a 領地 the host's rules and buildings come in as `rules`,
 * `decor` and `realm`, every seat is a guest (computer) and the end shows what the host earned.
 */
export function EightBoard({
  players,
  onExit,
  onAgain,
  rules,
  decor,
  realm,
  board = "eight",
  guestTicket,
}: {
  players: Player[];
  onExit: () => void;
  onAgain: () => void;
  rules?: Partial<TableRules>;
  decor?: Decor;
  /** Hosting on your own land: every seat is a guest and the end shows what you earned. */
  realm?: Realm;
  board?: BoardId;
  /** Playing on someone else's land: the ticket you paid to get in. */
  guestTicket?: number;
}) {
  const [table, setTable] = useState<TableState>(() => newTable(players, rules, board));
  const publicTable = !realm && guestTicket === undefined;
  const [reward, setReward] = useState<Stock | null>(null);
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(true);
  const [fast, setFast] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [wide, setWide] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const { t } = useLang();
  const tRef = useRef(t);
  tRef.current = t;
  const wideRef = useRef(false);
  const mount = useRef<HTMLDivElement>(null);
  const decorRef = useRef(decor);
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
      const special = (seat: number, when: string) => {
        const actor = actorOf(state.seats[seat]?.avatar ?? "");
        if (actor && SPECIAL_WHEN[actor] === when) scene.special(seat);
      };
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
              void scene.rainbow(event.seat);
            }
            break;
          case "second": {
            const doubles = state.lastDice?.[0] === event.die;
            await scene.wait(250);
            play("roll");
            await scene.roll(event.seat, 1, event.die);
            say(doubles ? "第二粒 {n}，孖寶！" : "第二粒 {n}", { n: event.die });
            await (doubles ? scene.sparkle("dice") : scene.wait(350));
            break;
          }
          case "saved":
            say("{name} 要留返 {n}，今次唔買", { name: who(event.seat), n: BUY_RESERVE });
            await scene.wait(500);
            break;
          case "fork":
            say(state.seats[event.seat]?.bot ? "{name} 喺分岔路口" : "揀路", { name: who(event.seat) });
            break;
          case "bought":
            play("coin");
            say("{name} 買地起樓 −{n}", { name: who(event.seat), n: event.price });
            special(event.seat, "builds");
            await Promise.all([scene.own(event.key, event.seat, 1), scene.pulse(event.seat)]);
            break;
          case "upgraded":
            play("build");
            say(event.level >= 4 ? "{name} 起咗地標！" : "{name} 升到第 {n} 級", { name: who(event.seat), n: event.level });
            if (event.level < 4) special(event.seat, "builds");
            await Promise.all([scene.own(event.key, event.seat, event.level), scene.pulse(event.seat, true)]);
            if (event.level >= 4) {
              scene.cheer(event.seat);
              await Promise.all([scene.fireworks(event.seat, 2), scene.coinsBurst(event.seat, 4)]);
            }
            break;
          case "rent":
            play("bad");
            say("{name} 交租 {n} 俾 {owner}", { name: who(event.seat), n: event.amount, owner: who(event.to) });
            special(event.seat, "pays");
            void scene.floatText(event.seat, `−${event.amount}`);
            await scene.coinsFly(event.seat, event.to, event.amount);
            void scene.floatText(event.to, `+${event.amount}`, "#16A34A");
            special(event.to, "paid");
            break;
          case "bonus":
            play(event.reason === "chest" ? "chest" : "coin");
            say(event.reason === "chest" ? "{name} 開寶箱 +{n}" : "{name} 十字路口 +{n}", { name: who(event.seat), n: event.amount });
            if (event.reason === "chest") scene.cheer(event.seat);
            await Promise.all([scene.coinsBurst(event.seat, event.amount), event.reason === "chest" ? scene.sparkle(event.seat) : null]);
            break;
          case "tax":
            play("bad");
            say("{name} 交稅 −{n}", { name: who(event.seat), n: event.amount });
            special(event.seat, "pays");
            void scene.floatText(event.seat, `−${event.amount}`);
            await scene.coinsFly(event.seat, null, event.amount);
            break;
          case "card": {
            const good = event.card.kind === "money" ? event.card.amount >= 0 : event.card.kind === "forward";
            play(good ? "lucky" : "miss");
            say("❓ {text}", { text: tRef.current(event.card.text) });
            special(event.seat, "card");
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
          case "house":
            play("coin");
            say("{name} 交租 {n} 俾主人", { name: who(event.seat), n: event.amount });
            special(event.seat, "pays");
            await scene.coinsFly(event.seat, null, event.amount);
            break;
          case "bankrupt":
            play("smash");
            say("{name} 破產！", { name: who(event.seat) });
            event.lost.forEach((key) => {
              scene.clear(key);
              scene.lockTile(key, false);
            });
            await scene.shatter(event.seat);
            break;
          case "power":
            play("lucky");
            say("{name} 抽到功能卡：{card}", { name: who(event.seat), card: tRef.current(POWER_INFO[event.power].name) });
            void scene.floatText(event.seat, POWER_INFO[event.power].icon, "#7C3AED");
            await scene.sparkle(event.seat);
            break;
          case "played": {
            const info = POWER_INFO[event.power];
            say(event.target !== undefined ? "{name} 用 {card} 對付 {target}！" : "{name} 用 {card}！", {
              name: who(event.seat),
              card: tRef.current(info.name),
              target: who(event.target ?? 0),
            });
            void scene.floatText(event.seat, info.icon, "#7C3AED");
            if (event.power === "boost") {
              play("build");
              await Promise.all([
                ...Object.entries(event.levels ?? {}).map(([key, level]) => scene.own(key, event.seat, level)),
                scene.pulse(event.seat, true),
                scene.sparkle(event.seat),
              ]);
              scene.cheer(event.seat);
            } else if (event.power === "lock" && event.key) {
              play("smash");
              scene.lockTile(event.key, true);
              await scene.wait(700);
            } else if (event.power === "wreck" && event.key) {
              play("smash");
              await scene.blast(event.key);
              const level = event.levels?.[event.key] ?? 0;
              if (level > 0) await scene.own(event.key, event.target ?? 0, level);
              else scene.clear(event.key);
            } else if (event.power === "swap" && event.target !== undefined) {
              play("lucky");
              await Promise.all([scene.puff(event.seat), scene.puff(event.target)]);
              scene.warp(event.seat, state.seats[event.seat].spot);
              scene.warp(event.target, state.seats[event.target].spot);
              await Promise.all([scene.puff(event.seat), scene.puff(event.target)]);
            }
            break;
          }
          case "shielded":
            play("lucky");
            say("{name} 用免租牌，唔使交租！", { name: who(event.seat) });
            void scene.floatText(event.seat, "🛡️", "#FBD000");
            await Promise.all([scene.pulse(event.seat, true), scene.sparkle(event.seat)]);
            break;
          case "lockedLot":
            say("{name} 踩中封咗嘅地，唔使交租", { name: who(event.seat) });
            await scene.wait(600);
            break;
          case "unlocked":
            scene.lockTile(event.key, false);
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
        // Only the first die now; the second is thrown once this one's walk has landed.
        await scene.roll(before.current, 0, next.lastDice[0]);
        say("第一粒 {n}", { n: next.lastDice[0] });
        await scene.wait(350);
      }
      await playEvents(scene, next.events, next);
      if (sceneRef.current !== scene) return;
      if (next.phase === "over") {
        scene.hideDice();
        scene.focus(null);
        // The winner gets a show before the results come up.
        scene.cheer(standings(next)[0]);
        await scene.fireworks(standings(next)[0], 3);
        if (sceneRef.current !== scene) return;
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
        // Players with a 3D character (you as the vampire, 阿殭, 阿木, 阿強) use it; the rest keep pawns.
        scene = createBoardScene(
          T,
          mount.current,
          stateRef.current.seats.map((seat) => seat.colour),
          decorRef.current,
          stateRef.current.board,
          stateRef.current.seats.map((seat) => actorOf(seat.avatar)),
        );
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
      else void run({ type: "roll", dice: [rollFace(), rollFace()], card: Math.floor(Math.random() * 1000), fly: Math.floor(Math.random() * 1000), power: Math.floor(Math.random() * 1000) });
    }, 1000);
    return () => window.clearInterval(id);
  }, [waiting, table.tick, run]);

  // Public table: your finish pays materials for your 領地 (private-land games pay none).
  const awarded = useRef(false);
  useEffect(() => {
    if (!publicTable || table.phase !== "over" || awarded.current || table.seats[0]?.bot) return;
    awarded.current = true;
    const gain = tableReward(standings(table).indexOf(0), table.seats.length);
    saveWallet(addStock(loadWallet(), gain));
    const id = window.setTimeout(() => setReward(gain), 0);
    return () => window.clearTimeout(id);
  }, [publicTable, table]);

  const me = table.seats[0];
  const mine = !busy && loaded === "ready" && table.current === 0 && table.phase !== "over" && !me.bankrupt;
  const turnsEach = table.rules.turnsEach;
  const round = Math.min(turnsEach, Math.max(...table.seats.map((seat) => seat.turnsTaken)) + 1);
  const lastRound = table.seats.every((seat) => seat.bankrupt || seat.turnsTaken >= turnsEach - 1);

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
            {t("第 {n}／{total} 轉", { n: round, total: turnsEach })}
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
              <Face seat={seat} className="size-9 border-[3px] text-lg" />
              <span className="text-[11px] font-black leading-tight">{t(seat.name)}</span>
              <span key={seat.cash} className="flex items-center gap-0.5 text-sm font-black tabular-nums animate-[bump_0.35s_ease-out]">
                <Coin />
                {seat.cash}
              </span>
              {seat.jailed ? <span className="text-xs">🔒</span> : null}
              {seat.powers.length ? (
                <span className="text-[11px] font-black leading-none" aria-label={t("功能卡 {n} 張", { n: seat.powers.length })}>
                  {"🃏".repeat(seat.powers.length)}
                </span>
              ) : null}
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

      {/* The last round: gold glow round the screen and a banner. */}
      {lastRound && table.phase !== "over" ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[5] shadow-[inset_0_0_60px_18px_rgba(251,208,0,0.55)]" />
          <p className="pointer-events-none absolute inset-x-0 top-[17%] z-20 text-center text-lg font-black text-[#FBD000] drop-shadow-[0_2px_0_#1E3A8A]">
            {t("⏳ 最後一轉！")}
          </p>
        </>
      ) : null}

      {/* Your 功能卡: play one before rolling. */}
      {me.powers.length && table.phase !== "over" ? (
        <div className="absolute inset-x-0 bottom-[8.5rem] z-20 flex justify-center gap-2 px-4" data-testid="power-hand">
          {me.powers.map((power, index) => {
            const info = POWER_INFO[power];
            const usable = mine && table.phase === "roll" && canPlay(table, 0, power);
            return (
              <button
                key={`${power}-${index}`}
                type="button"
                disabled={!usable}
                onClick={() => {
                  const others = table.seats.flatMap((seat, i) => (i !== 0 && !seat.bankrupt ? [i] : []));
                  if (power === "swap" && others.length > 1) setPicking(index);
                  else void run({ type: "power", index, target: others[0] });
                }}
                className="flex w-28 cursor-pointer flex-col items-center rounded-2xl border-[3px] border-[#7C3AED] bg-white/95 px-2 py-1 text-[#1E3A8A] shadow-[0_4px_0_#4C1D95] disabled:cursor-default disabled:opacity-60 enabled:animate-[glow_1.8s_ease-in-out_infinite]"
                data-testid={`power-${power}`}
              >
                <span className="text-2xl leading-none">{info.icon}</span>
                <span className="text-sm font-black">{t(info.name)}</span>
                <span className="text-[10px] font-bold leading-tight">{t(info.what)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 換位: who to trade places with. */}
      {picking !== null && mine ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#1E3A8A]/60 px-5" data-testid="swap-pick">
          <div className="w-full max-w-xs rounded-3xl border-4 border-[#FBD000] bg-white p-4 text-center">
            <p className="mb-3 font-black">{t("同邊個換位？")}</p>
            <div className="flex justify-center gap-3">
              {table.seats.map((seat, i) =>
                i === 0 || seat.bankrupt ? null : (
                  <button
                    key={seat.name}
                    type="button"
                    className="flex cursor-pointer flex-col items-center"
                    onClick={() => {
                      const index = picking;
                      setPicking(null);
                      void run({ type: "power", index, target: i });
                    }}
                  >
                    <Face seat={seat} className="size-12 border-[3px]" />
                    <span className="text-xs font-black">{t(seat.name)}</span>
                  </button>
                ),
              )}
            </div>
            <button type="button" className="mt-3 cursor-pointer text-sm font-black text-[#3B5BA9]" onClick={() => setPicking(null)}>
              {t("唔換住")}
            </button>
          </div>
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
          onClick={() => void run({ type: "roll", dice: [rollFace(), rollFace()], card: Math.floor(Math.random() * 1000), fly: Math.floor(Math.random() * 1000), power: Math.floor(Math.random() * 1000) })}
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
          {standings(table)[0] === 0 && !table.seats[0].bot ? <Confetti /> : null}
          <div className="relative w-full animate-[pop_0.4s_ease-out] rounded-[32px] border-4 border-[#FBD000] bg-white p-4 shadow-2xl">
            <h2 className="mb-3 text-center text-2xl font-black">
              {standings(table)[0] === 0 && !table.seats[0].bot ? t("🎉 你贏咗！") : t("🏆 結果")}
            </h2>
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
                    <span className="w-7 text-center text-xl">{["🥇", "🥈", "🥉", "4", "5", "6"][place]}</span>
                    <Face seat={player} className="size-10 border-[3px] text-xl" />
                    <span className="flex-1 font-black">{t(player.name)}</span>
                    <span className="flex items-center gap-0.5 font-black tabular-nums">
                      <Coin />
                      {netWorth(table, seat)}
                    </span>
                    {realm ? null : (
                      <span className="rounded-full bg-[#1E3A8A] px-2 text-xs font-black text-white">
                        {t("+{n} 分", { n: SEASON_POINTS[table.seats.length]?.[place] ?? 0 })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {realm ? <HostReport realm={realm} guests={table.seats.length} houseRent={table.hostIncome} /> : null}
            {guestTicket !== undefined ? (
              <p className="mt-3 text-center text-sm font-black text-[#4C1D95]">{t("你入場付咗門票 {n}", { n: guestTicket })}</p>
            ) : null}
            {reward ? (
              <p className="mt-3 rounded-2xl bg-[#FFF8D6] p-2 text-center text-sm font-black" data-testid="table-reward">
                {t("材料獎勵：🪵{w} 🧱{s} 🪙{g}", { w: reward.wood, s: reward.stone, g: reward.gold })}
              </p>
            ) : null}
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

/** What the host took from one game on their 領地. Numbers marked 臨時 are placeholders. */
function HostReport({ realm, guests, houseRent }: { realm: Realm; guests: number; houseRent: number }) {
  const { t } = useLang();
  const report = hostReport(realm, guests, houseRent);
  const row = (label: string, value: string, strong = false) => (
    <div className={cn("flex items-center justify-between", strong && "border-t-2 border-[#FBD000] pt-1 text-lg")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <section className="mt-3 space-y-1 rounded-2xl bg-[#F3EEFF] p-3 text-sm font-black text-[#4C1D95]" data-testid="host-report">
      <h3 className="text-center text-base">{t("🏰 主人收入")}</h3>
      {realm.ticket === 0 ? <p className="text-center text-xs">{t("免費場：分數局，冇門票")}</p> : null}
      {row(t("門票 {n} × {g} 位客", { n: realm.ticket, g: guests }), `+${report.tickets}`)}
      {row(t("地稅 {n}%", { n: LAND_TAX * 100 }), `−${report.tax}`)}
      {row(t("租金屋收租"), `+${report.houseRent}`)}
      {row(t("呢一局淨收"), `${report.net}`, true)}
      {report.tables > 1 ? row(t("{n} 張枱坐滿，每輪大約", { n: report.tables }), `${report.perRound}`) : null}
    </section>
  );
}
