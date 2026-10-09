"use client";

import { juice } from "@/components/juice";
import { ACTORS, createBoardScene, loadThree, type BoardScene, type Decor } from "@/components/eight-scene";
import { ENERGY_ICON, compactEnergy, formatEnergy, tableEnergy } from "@/lib/energy";
import { CHARACTERS, savePick, savedPick } from "@/lib/characters";
import {
  BOARDS,
  BUY_RESERVE,
  BAIL,
  ENTRY_FEE,
  HOUSE_CUT,
  JAIL,
  SEASON_POINTS,
  STAKE,
  START_PAY,
  MAP_PIECES,
  SAND_BACK,
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
import { setTrack } from "@/lib/music";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";

/** Camera distance on the table: close on the player, a little back, or the whole board. */
type View = "near" | "mid" | "far";
// Sky (2026-10-09): no close-up any more, just 中 and 遠.
const VIEWS: [View, string][] = [
  ["mid", "中"],
  ["far", "遠"],
];

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
/** You as the character you picked, then the computer players as the characters left over. */
function seatsFor(pick: number, opponents: number): Player[] {
  const mine = CHARACTERS[pick] ?? CHARACTERS[0];
  const rest = CHARACTERS.filter((_, i) => i !== pick).map((c) => ({ ...c, bot: true }));
  return [{ name: "你", avatar: mine.avatar, colour: mine.colour, bot: false }, ...rest].slice(0, opponents + 1);
}

/** The 3D character for a seat, from its avatar picture (vampire, jiangshi, mummy, zombie), or null. */
const MAT_NAME = { wood: "木材", stone: "石磚", gold: "金塊" } as const;
const MAT_ICON = { wood: "🪵", stone: "🧱", gold: "🪙" } as const;

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
  shield: { name: "護盾", icon: "🛡️", what: "擋一次交租或者怪獸（自動用）" },
  monster: { name: "怪獸卡", icon: "👹", what: "叫怪獸打對手：搶 2、打退 3 格" },
  levy: { name: "收保護費", icon: "🤑", what: "每個對手即刻俾你 1 粒" },
  double: { name: "雙倍租", icon: "💰", what: "兩圈內你啲地收雙倍租" },
};

/** Cards with a drawn picture; the newer ones show their emoji until they get one. */
const CARD_ART = new Set<Power>(["boost", "lock", "wreck", "swap", "shield", "monster", "levy", "double"]);
function CardPic({ power, className }: { power: Power; className?: string }) {
  if (CARD_ART.has(power)) return <img src={`/art/cards/${power}.webp`} alt="" draggable={false} className={cn("object-contain", className)} />;
  return (
    <span className={cn("flex items-center justify-center leading-none", className)} style={{ fontSize: "0.8em" }} aria-hidden>
      {POWER_INFO[power].icon}
    </span>
  );
}

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

/** A table amount (one decimal) as 能量 with separators: 18 → "180,000". */
const E = (n: number) => formatEnergy(tableEnergy(n));

function Energy({ className }: { className?: string }) {
  return <img src={ENERGY_ICON} alt="" className={cn("inline-block size-[1.1em] align-[-0.15em]", className)} />;
}

function Lobby({ onStart, onExit }: { onStart: (players: Player[]) => void; onExit: () => void }) {
  const { t, lang } = useLang();
  const [opponents, setOpponents] = useState(3);
  const [pick, setPick] = useState(0);
  useEffect(() => setPick(savedPick()), []);
  const choose = (i: number) => {
    setPick(i);
    savePick(i);
  };
  const seats = seatsFor(pick, opponents);
  return (
    <main
      // Sky's picture (2026-10-01): a castle island floating in space, the same world as the board.
      style={{ backgroundImage: "url(/art/table-lobby.webp)" }}
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col items-center gap-5 overflow-hidden bg-[#5B3FA8] bg-cover bg-bottom px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[max(env(safe-area-inset-top),0.75rem)] text-[#1E3A8A]"
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

      {/* Entry (shown as 能量): 20 in, the house keeps 2 as the ticket, 18 goes on the table. No card round it (Sky 2026-10-01): straight on the picture. */}
      <section className="w-full px-2 text-white [text-shadow:0_2px_4px_rgba(30,20,80,0.9)]" data-testid="entry">
        <div className="flex items-center justify-between text-center font-black">
          <div className="flex flex-col items-center">
            <span className="text-xs text-white/85">{t("入場")}</span>
            <span className="flex items-center gap-1 text-3xl tabular-nums"><Energy />{compactEnergy(tableEnergy(ENTRY_FEE), lang)}</span>
          </div>
          <span className="text-xl text-white/70">→</span>
          <div className="flex flex-col items-center">
            <span className="text-xs text-white/85">{t("門票")}</span>
            <span className="text-3xl tabular-nums text-[#FF9AA8]">{compactEnergy(-tableEnergy(HOUSE_CUT), lang)}</span>
          </div>
          <span className="text-xl text-white/70">→</span>
          <div className="flex flex-col items-center">
            <span className="text-xs text-white/85">{t("落場")}</span>
            <span className="text-4xl tabular-nums text-[#FFE066]">{compactEnergy(tableEnergy(STAKE), lang)}</span>
          </div>
        </div>
        <p className="mt-1 text-center text-xs font-bold text-white/85">{t("練習局：用練習能量，打完清零")}</p>
      </section>

      {/* Your character: first come, first served; the computer players get the rest. */}
      {/* No white card behind the characters (Sky 2026-10-01): they stand straight on the picture. */}
      <section className="w-full p-1" data-testid="character-pick">
        <h2 className="mb-2 text-center text-sm font-black text-white [text-shadow:0_2px_4px_rgba(30,58,138,0.9)]">{t("揀你嘅角色")}</h2>
        <div className="grid grid-cols-4 gap-2">
          {CHARACTERS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onClick={() => choose(i)}
              aria-pressed={pick === i}
              className={cn(
                "flex cursor-pointer flex-col items-center p-1.5 transition duration-200",
                pick === i ? "scale-110" : "scale-90 opacity-60",
              )}
              data-testid={`character-${i}`}
            >
              {/* The one you picked is bigger, with a gold glow round it; no box (Sky 2026-10-01). */}
              <Face
                seat={c}
                className={cn("size-14 border-[3px]", pick === i && "shadow-[0_0_0_3px_#FBD000,0_0_22px_8px_rgba(251,208,0,0.7)]")}
              />
              <span
                className={cn(
                  "mt-1.5 text-xs font-black [text-shadow:0_1px_3px_rgba(30,20,80,0.95)]",
                  pick === i ? "text-[#FFE066]" : "text-white",
                )}
              >
                {t(c.name)}
              </span>
              {pick === i ? <span className="text-[10px] font-black text-[#FFE066] [text-shadow:0_1px_3px_rgba(30,20,80,0.95)]">{t("你揀咗")}</span> : null}
            </button>
          ))}
        </div>
      </section>

      {/* Opponents: pick 1–3 computer players. */}
      <section className="flex w-full flex-col items-center gap-3">
        <h2 className="text-center text-sm font-black text-white [text-shadow:0_2px_4px_rgba(30,58,138,0.9)]">{t("揀對手")}</h2>
        <div className="flex gap-4">
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setOpponents(count)}
              className={cn(
                // No pill round each choice (Sky 2026-10-01): the chosen group is bigger and glows, the others fade.
                "flex cursor-pointer items-center -space-x-2 rounded-full p-1 transition duration-200",
                opponents === count ? "scale-110 shadow-[0_0_20px_6px_rgba(251,208,0,0.55)]" : "scale-90 opacity-55",
              )}
              aria-label={t("{n} 人枱", { n: count + 1 })}
              data-testid={`opponents-${count}`}
            >
              {seatsFor(pick, count).slice(1).map((seat) => (
                <Face key={seat.name} seat={seat} className="size-9 border-2 border-white" />
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
        // Same look as the title screen's START button (Sky 2026-10-01): glossy red pill, no yellow ring.
        className="relative mt-auto h-14 w-4/5 cursor-pointer animate-[bob_2.4s_ease-in-out_infinite] overflow-hidden rounded-full bg-gradient-to-b from-[#FF5A4E] to-[#D91F1A] font-display text-xl font-extrabold text-white shadow-[0_5px_0_#9E1512,0_12px_24px_rgba(15,42,107,0.45)] transition-transform active:translate-y-1 active:shadow-[0_1px_0_#9E1512]"
        data-testid="table-start"
      >
        <span className="absolute inset-x-3 top-1 h-[42%] rounded-full bg-white/30" aria-hidden="true" />
        <span className="relative text-2xl tracking-[0.2em]">{t("開枱")}</span>
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

type Toast = { key: number; text: string; x?: number; y?: number };

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
  // The public table plays its own faster music while the board is up (Sky 2026-10-01).
  useEffect(() => {
    setTrack("table");
    return () => setTrack("home");
  }, []);
  const [table, setTable] = useState<TableState>(() => newTable(players, rules, board));
  const publicTable = !realm && guestTicket === undefined;
  const [reward, setReward] = useState<Stock | null>(null);
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState(true);
  const [fast, setFast] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [view, setView] = useState<View>("mid");
  const [picking, setPicking] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const { t, lang } = useLang();
  const tRef = useRef(t);
  tRef.current = t;
  const viewRef = useRef<View>("mid");
  const mount = useRef<HTMLDivElement>(null);
  const decorRef = useRef(decor);
  const sceneRef = useRef<BoardScene | null>(null);
  const stateRef = useRef<TableState>(table);
  const running = useRef(false);
  const fastRef = useRef(false);
  const toastKey = useRef(0);

  /** Show a line, translated into the current language. */
  /** Someone just got a 功能卡: their seat glows and the card pops up over it (Sky: show who got it). */
  const [gotCard, setGotCard] = useState<{ seat: number; power: Power; key: number } | null>(null);
  const cardKey = useRef(0);
  const showCard = useCallback((seat: number, power: Power) => {
    cardKey.current += 1;
    const key = cardKey.current;
    setGotCard({ seat, power, key });
    window.setTimeout(() => setGotCard((now) => (now?.key === key ? null : now)), 2200);
  }, []);
  /** Whose event is playing: its messages pop up over that player's token (Sky 2026-10-09: not over the board). */
  const seatNow = useRef<number | null>(null);
  const say = useCallback((text: string, vars?: Record<string, string | number>) => {
    toastKey.current += 1;
    const at = seatNow.current !== null ? sceneRef.current?.anchorOf(seatNow.current) ?? null : null;
    setToast({ key: toastKey.current, text: tRef.current(text, vars), x: at?.x, y: at?.y });
  }, []);

  /** Point the camera at a seat from the distance the player picked: 近, 中, or 遠 (the whole board). */
  const aim = useCallback(
    (scene: BoardScene, seat: number) => (viewRef.current === "far" ? scene.focus(null) : scene.focus(seat, viewRef.current)),
    [],
  );

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
      for (let n = 0; n < events.length; n += 1) {
        const event = events[n];
        if (sceneRef.current !== scene) return;
        seatNow.current = "seat" in event && typeof event.seat === "number" ? event.seat : null;
        // Before a run of steps, light up the stone it ends on (Sky 2026-10-09).
        if (event.kind === "step" && events[n - 1]?.kind !== "step") {
          let last = n;
          while (events[last + 1]?.kind === "step") last += 1;
          const end = events[last];
          if (end.kind === "step") scene.markTarget(BOARDS[state.board].keyOf(end.to));
        }
        if (event.kind !== "step") scene.markTarget(null);
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
            say("{name} 付 {n} 保釋出獄", { name: who(event.seat), n: E(BAIL) });
            await scene.wait(800);
            break;
          case "step":
            await scene.stepTo(event.seat, event.to);
            play("step");
            if (event.passedStart) {
              play("coin");
              say(state.board === "clover" ? "經過廣場 +{n}" : "經過起點 +{n}", { n: E(START_PAY) });
              void scene.coinsBurst(event.seat, 2);
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
            say("{name} 要留返 {n}，今次唔買", { name: who(event.seat), n: E(BUY_RESERVE) });
            await scene.wait(500);
            break;
          case "fork":
            say(state.seats[event.seat]?.bot ? "{name} 喺分岔路口" : "揀路", { name: who(event.seat) });
            break;
          case "bought":
            play("coin");
            say("{name} 買地起樓 −{n}", { name: who(event.seat), n: E(event.price) });
            juice(state.seats[event.seat]?.bot ? "small" : "medium", undefined, window.innerHeight * 0.45);
            special(event.seat, "builds");
            await Promise.all([scene.own(event.key, event.seat, 1), scene.pulse(event.seat)]);
            break;
          case "upgraded":
            play("build");
            say(event.level >= 4 ? "{name} 起咗地標！" : "{name} 升到第 {n} 級", { name: who(event.seat), n: event.level });
            juice(event.level >= 4 ? "large" : state.seats[event.seat]?.bot ? "small" : "medium", undefined, window.innerHeight * 0.45);
            if (event.level < 4) special(event.seat, "builds");
            await Promise.all([scene.own(event.key, event.seat, event.level), scene.pulse(event.seat, true)]);
            if (event.level >= 4) {
              scene.cheer(event.seat);
              await Promise.all([scene.fireworks(event.seat, 2), scene.coinsBurst(event.seat, 4)]);
            }
            break;
          case "rent":
            play("bad");
            say("{name} 交租 {n} 俾 {owner}", { name: who(event.seat), n: E(event.amount), owner: who(event.to) });
            special(event.seat, "pays");
            void scene.floatText(event.seat, `−${E(event.amount)}`);
            await scene.coinsFly(event.seat, event.to, event.amount);
            void scene.floatText(event.to, `+${E(event.amount)}`, "#16A34A");
            special(event.to, "paid");
            break;
          case "bonus":
            play(event.reason === "chest" ? "chest" : "coin");
            say(event.reason === "chest" ? "{name} 開寶箱 +{n}" : "{name} 十字路口 +{n}", { name: who(event.seat), n: E(event.amount) });
            if (event.reason === "chest") scene.cheer(event.seat);
            await Promise.all([scene.coinsBurst(event.seat, event.amount), event.reason === "chest" ? scene.sparkle(event.seat) : null]);
            break;
          case "tax":
            play("bad");
            say("{name} 交稅 −{n}", { name: who(event.seat), n: E(event.amount) });
            special(event.seat, "pays");
            void scene.floatText(event.seat, `−${E(event.amount)}`);
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
            say("{name} 交租 {n} 俾主人", { name: who(event.seat), n: E(event.amount) });
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
            showCard(event.seat, event.power);
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
            } else if (event.power === "levy") {
              play("coin");
              const payers = Object.entries(event.paid ?? {});
              let total = 0;
              for (const [other, amount] of payers) {
                total += amount;
                void scene.floatText(Number(other), `−${E(amount)}`);
              }
              await Promise.all(payers.map(([other, amount]) => scene.coinsFly(Number(other), event.seat, amount)));
              if (total > 0) void scene.floatText(event.seat, `+${E(total)}`, "#16A34A");
              scene.cheer(event.seat);
            } else if (event.power === "double") {
              play("lucky");
              say("{name} 啲地兩圈內收雙倍租！", { name: who(event.seat) });
              await Promise.all([scene.pulse(event.seat, true), scene.sparkle(event.seat)]);
            } else if (event.power === "swap" && event.target !== undefined) {
              play("lucky");
              await Promise.all([scene.puff(event.seat), scene.puff(event.target)]);
              scene.warp(event.seat, state.seats[event.seat].spot);
              scene.warp(event.target, state.seats[event.target].spot);
              await Promise.all([scene.puff(event.seat), scene.puff(event.target)]);
            }
            break;
          }
          case "monster": {
            play("smash");
            say(event.side === "left" ? "{name} 叫火龍噴 {target}！" : "{name} 叫炮石怪轟 {target}！", { name: who(event.seat), target: who(event.target) });
            await scene.monsterAttack(event.side, event.target, event.to, event.blocked);
            if (event.blocked) {
              say("{name} 用護盾擋咗！", { name: who(event.target) });
              await scene.sparkle(event.target);
            } else {
              if (event.stolen > 0) {
                void scene.floatText(event.target, `−${E(event.stolen)}`);
                void scene.floatText(event.seat, `+${E(event.stolen)}`, "#16A34A");
              }
              special(event.seat, "builds");
              scene.cheer(event.seat);
              await scene.wait(400);
            }
            break;
          }
          case "doubleOver":
            say("{name} 嘅雙倍租完咗", { name: who(event.seat) });
            break;
          case "shielded":
            play("lucky");
            say("{name} 用護盾，唔使交租！", { name: who(event.seat) });
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
          // ---------- 三葉草 (領地 海島) ----------
          case "gather": {
            const name = tRef.current(MAT_NAME[event.material]);
            if (event.amount > 0) {
              play(event.material === "gold" ? "chest" : "coin");
              say(event.why === "caravan" ? "{name} 商隊送 {mat} +{n}" : "{name} 採集 {mat} +{n}", { name: who(event.seat), mat: name, n: event.amount });
              void scene.floatText(event.seat, `+${event.amount} ${MAT_ICON[event.material]}`, "#16A34A");
              await scene.sparkle(event.seat);
            } else {
              play("bad");
              say(event.why === "termite" ? "{name} 遇到白蟻，{mat} −{n}" : "{name} 山泥傾瀉，{mat} −{n}", { name: who(event.seat), mat: name, n: -event.amount });
              if (event.amount < 0) void scene.floatText(event.seat, `${event.amount} ${MAT_ICON[event.material]}`);
              await scene.wait(800);
            }
            break;
          }
          case "map":
            play("lucky");
            say("{name} 執到藏寶圖碎片 {n}／{total}", { name: who(event.seat), n: event.pieces, total: MAP_PIECES });
            void scene.floatText(event.seat, `🗺️ ${event.pieces}/${MAP_PIECES}`, "#7C3AED");
            await scene.wait(800);
            break;
          case "treasure":
            play("chest");
            say("{name} 砌齊藏寶圖，挖到寶藏！", { name: who(event.seat) });
            scene.cheer(event.seat);
            void scene.floatText(event.seat, `+${event.gold} ${MAT_ICON.gold}`, "#D97706");
            await Promise.all([scene.coinsBurst(event.seat, event.cash), scene.fireworks(event.seat, 1)]);
            break;
          case "toll":
            play("coin");
            say("{name} 過地主關卡，交 {n} 俾地主", { name: who(event.seat), n: E(event.amount) });
            special(event.seat, "pays");
            void scene.floatText(event.seat, `−${E(event.amount)}`);
            await scene.coinsFly(event.seat, null, event.amount);
            break;
          case "artisan":
            play("lucky");
            say("{name} 請到工匠：下次採集雙倍", { name: who(event.seat) });
            void scene.floatText(event.seat, "🔨 ×2", "#7C3AED");
            await scene.sparkle(event.seat);
            break;
          case "trade":
            play("coin");
            say("{name} 同商隊交易：{n} {give} 換 {m} {take}", {
              name: who(event.seat),
              n: event.gave,
              give: tRef.current(MAT_NAME[event.give]),
              m: event.took,
              take: tRef.current(MAT_NAME[event.take]),
            });
            void scene.floatText(event.seat, `${MAT_ICON[event.give]}→${MAT_ICON[event.take]}`, "#D97706");
            await scene.wait(900);
            break;
          case "bandit":
            play("bad");
            say(event.material ? "{name} 俾山賊搶咗 1 {mat}！" : "山賊搜身，{name} 乜都冇", {
              name: who(event.seat),
              mat: event.material ? tRef.current(MAT_NAME[event.material]) : "",
            });
            if (event.material) void scene.floatText(event.seat, `−1 ${MAT_ICON[event.material]}`);
            await scene.wait(900);
            break;
          case "sand":
            play("miss");
            say("{name} 跌落流沙，退後 {n} 格", { name: who(event.seat), n: SAND_BACK });
            await scene.flyTo(event.seat, event.to);
            break;
          case "spawn":
            say("新一圈！功能卡出現咗");
            await scene.showPickup(event.key);
            break;
          case "pickup":
            play("lucky");
            say("{name} 執到功能卡：{card}", { name: who(event.seat), card: tRef.current(POWER_INFO[event.power].name) });
            showCard(event.seat, event.power);
            await scene.takePickup(event.seat, event.key);
            void scene.floatText(event.seat, POWER_INFO[event.power].icon, "#7C3AED");
            await scene.sparkle(event.seat);
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
        stateRef.current.pickups.forEach((p) => void scene?.showPickup(p.key));
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

  /** 近 / 中 / 遠 (Sky 2026-10-01): the camera keeps that distance for the rest of the game. */
  const pickView = (next: View) => {
    viewRef.current = next;
    setView(next);
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
  // 三葉草: what was gathered goes home — a guest keeps their own haul; the host gets what the 山賊 took.
  useEffect(() => {
    if (table.board !== "clover" || table.phase !== "over" || awarded.current) return;
    const gain: Stock | undefined = realm ? table.hostStock : guestTicket !== undefined && !table.seats[0]?.bot ? table.seats[0]?.stock : undefined;
    if (!gain) return;
    awarded.current = true;
    saveWallet(addStock(loadWallet(), gain));
    const id = window.setTimeout(() => setReward(gain), 0);
    return () => window.clearTimeout(id);
  }, [table, realm, guestTicket]);
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
  const order = standings(table);
  const rankOf = table.seats.map((_, seat) => order.indexOf(seat));
  const holdings = table.seats.map((_, seat) => {
    const mine = Object.values(table.deeds).filter((deed) => deed.owner === seat);
    return { lots: mine.length, levels: mine.reduce((sum, deed) => sum + Math.max(0, deed.level - 1), 0) };
  });

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
                "relative flex min-w-0 flex-1 flex-col items-center rounded-2xl border-[3px] bg-white/90 py-1 shadow-md transition-transform",
                table.current === index && table.phase !== "over" ? "scale-105 border-[#FBD000]" : "border-transparent",
                seat.bankrupt && "opacity-40 grayscale",
                gotCard?.seat === index && "animate-[icon-glow_0.9s_ease-in-out_2]",
              )}
              data-testid={`seat-${index}`}
            >
              {/* Rank by what each player is worth (cash, land and buildings): gold, silver, bronze. */}
              <span
                className={cn(
                  "absolute -left-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 border-white text-[11px] font-black text-white shadow",
                  ["bg-[#E8B400]", "bg-[#9AA4B2]", "bg-[#C47A3A]"][rankOf[index]] ?? "bg-[#64748B]",
                )}
                data-testid={`rank-${index}`}
              >
                {rankOf[index] + 1}
              </span>
              <Face seat={seat} className="size-9 border-[3px] text-lg" />
              <span className="text-[11px] font-black leading-tight">{t(seat.name)}</span>
              <span key={seat.cash} className="flex items-center gap-0.5 text-sm font-black tabular-nums animate-[bump_0.35s_ease-out]">
                <Energy />
                {compactEnergy(tableEnergy(seat.cash), lang)}
              </span>
              {/* 三葉草: materials gathered instead of land. */}
              {seat.stock ? (
                <span className="flex items-center gap-1 text-[10px] font-black leading-tight text-[#3B5BA9] tabular-nums" data-testid={`stock-${index}`}>
                  {(["wood", "stone", "gold"] as const).map((m) => (
                    <span key={m} className="inline-flex items-center">
                      <img src={`/art/realm/${m}.webp`} alt="" className="size-3.5 object-contain" />
                      {seat.stock![m]}
                    </span>
                  ))}
                  {seat.maps ? <span>🗺️{seat.maps}</span> : null}
                </span>
              ) : null}
              {/* How much land and how many building levels they hold. */}
              {<span className="text-[10px] font-black leading-tight text-[#3B5BA9] tabular-nums" data-testid={`holdings-${index}`}>
                {table.board === "clover" ? t("地 {l}・升級 {b}", { l: holdings[index].lots, b: holdings[index].levels }) : t("地 {l}・樓 {b}", { l: holdings[index].lots, b: holdings[index].levels })}
              </span>}
              {seat.jailed ? <span className="text-xs">🔒</span> : null}
              {seat.powers.length ? (
                <span className="flex max-w-full flex-wrap justify-center gap-0.5" aria-label={t("功能卡 {n} 張", { n: seat.powers.length })}>
                  {seat.powers.map((power, k) => (
                    <CardPic key={k} power={power} className={seat.powers.length > 3 ? "size-4 text-base" : "size-5 text-xl"} />
                  ))}
                </span>
              ) : null}
              {gotCard?.seat === index ? (
                <span
                  key={gotCard.key}
                  className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 flex -translate-x-1/2 animate-[pop_0.35s_ease-out] flex-col items-center whitespace-nowrap rounded-xl border-[3px] border-[#FBD000] bg-[#7C3AED] px-2 py-1 text-white shadow-xl"
                  data-testid="got-card"
                >
                  <CardPic power={gotCard.power} className="size-12 text-5xl drop-shadow" />
                  <span className="text-[11px] font-black">{t(POWER_INFO[gotCard.power].name)}</span>
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

      {toast && toast.x !== undefined && toast.y !== undefined ? (
        // Over the player's head: small, rising and fading, kept on screen.
        <p
          key={toast.key}
          className="pointer-events-none fixed z-30 animate-[toast-rise_1.5s_ease-out_forwards] whitespace-nowrap rounded-full border-2 border-[#FBD000] bg-[#1E3A8A]/90 px-3 py-1 text-sm font-black text-white shadow-lg"
          style={{ left: Math.max(70, Math.min(window.innerWidth - 70, toast.x)), top: toast.y, translate: "-50% -100%" }}
          data-testid="table-toast"
          role="status"
        >
          {toast.text}
        </p>
      ) : toast ? (
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
        <div
          className={cn(
            // Sky (2026-10-09): small, down the right-hand side, not across the board.
            "absolute right-2 bottom-[calc(max(env(safe-area-inset-bottom),1rem)+7.5rem)] z-20 flex max-h-[45dvh] flex-col gap-1.5 overflow-y-auto pb-1",
          )}
          data-testid="power-hand"
        >
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
                  if ((power === "swap" || power === "monster") && others.length > 1) setPicking(index);
                  else void run({ type: "power", index, target: others[0] });
                }}
                className="flex w-16 shrink-0 cursor-pointer flex-col items-center rounded-xl border-2 border-[#7C3AED] bg-white/90 px-1 py-0.5 text-[#1E3A8A] shadow-[0_3px_0_#4C1D95] disabled:cursor-default disabled:opacity-60 enabled:animate-[glow_1.8s_ease-in-out_infinite]"
                aria-label={`${t(info.name)}：${t(info.what)}`}
                data-testid={`power-${power}`}
              >
                <CardPic power={power} className="size-9 text-3xl drop-shadow" />
                <span className="text-[11px] font-black leading-tight">{t(info.name)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 換位: who to trade places with. */}
      {picking !== null && mine ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#1E3A8A]/60 px-5" data-testid="swap-pick">
          <div className="w-full max-w-xs rounded-3xl border-4 border-[#FBD000] bg-white p-4 text-center">
            <p className="mb-3 font-black">{me.powers[picking] === "monster" ? t("叫怪獸打邊個？") : t("同邊個換位？")}</p>
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
              {me.powers[picking] === "monster" ? t("唔打住") : t("唔換住")}
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
        {/* The dice button sits in the middle, raised above the speed and camera buttons (Sky 2026-10-01). */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),1rem)+3.75rem)] flex justify-center">
          <button
            type="button"
            disabled={!mine || table.phase !== "roll"}
            onClick={() => void run({ type: "roll", dice: [rollFace(), rollFace()], card: Math.floor(Math.random() * 1000), fly: Math.floor(Math.random() * 1000), power: Math.floor(Math.random() * 1000) })}
            className="pointer-events-auto relative size-24 cursor-pointer rounded-full border-[6px] border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-2xl font-black text-white shadow-[0_6px_0_#8E1210] active:translate-y-1 disabled:cursor-default disabled:opacity-50 enabled:animate-[glow_1.8s_ease-in-out_infinite]"
            aria-label={countdown !== null ? t("{n} 秒後自動擲骰", { n: countdown }) : t("擲骰")}
            data-testid="table-roll"
          >
            {/* A die picture instead of words (Sky 2026-10-01); the countdown sits on it as a badge. */}
            <img src="/art/ui/dice.webp" alt="" draggable={false} className="mx-auto size-14 object-contain drop-shadow-[0_3px_3px_rgba(0,0,0,0.4)]" />
            {countdown !== null && table.phase === "roll" ? (
              <span className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full border-[3px] border-[#FBD000] bg-[#1E3A8A] text-base font-black tabular-nums">
                {countdown}
              </span>
            ) : null}
          </button>
        </div>
        <div className="pointer-events-auto flex overflow-hidden rounded-full border-[3px] border-[#FBD000] bg-[#1E3A8A] shadow-[0_4px_0_#0F1F4D]" role="group" aria-label={t("鏡頭距離")} data-testid="table-view">
          {VIEWS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => pickView(id)}
              aria-pressed={view === id}
              className={cn("cursor-pointer px-3 py-2 text-sm font-black transition", view === id ? "bg-[#FBD000] text-[#1E3A8A]" : "text-white")}
            >
              {t(label)}
            </button>
          ))}
        </div>
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
                      <Energy />
                      {E(netWorth(table, seat))}
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
              <p className="mt-3 text-center text-sm font-black text-[#4C1D95]">{t("你入場付咗門票 {n} 能量", { n: E(guestTicket) })}</p>
            ) : null}
            {reward ? (
              <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-[#FFF8D6] p-2 text-sm font-black" data-testid="table-reward">
                {t("材料獎勵：")}
                {(["wood", "stone", "gold"] as const).map((m) => (
                  <span key={m} className="inline-flex items-center">
                    <img src={`/art/realm/${m}.webp`} alt="" className="size-7 object-contain" />
                    {reward[m]}
                  </span>
                ))}
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
      {realm.ticket === 0 ? <p className="text-center text-xs">{t("免費場：冇門票")}</p> : null}
      {row(t("門票 {n} × {g} 位客", { n: E(realm.ticket), g: guests }), `+${E(report.tickets)}`)}
      {row(t("地稅 {n}%", { n: LAND_TAX * 100 }), `−${E(report.tax)}`)}
      {row(t("租金屋收租"), `+${E(report.houseRent)}`)}
      {row(t("呢一局淨收"), `${E(report.net)}`, true)}
      {report.tables > 1 ? row(t("{n} 張枱坐滿，每輪大約", { n: report.tables }), `${E(report.perRound)}`) : null}
    </section>
  );
}
