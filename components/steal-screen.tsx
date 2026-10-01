"use client";

import { CHARACTERS } from "@/lib/characters";
import { JACKPOT, STEAL_DANGERS, STEAL_PICKS, stealDone, stealPicksLeft, type GameState, type StealBox, type StealKind } from "@/lib/game";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { SmokeCloud } from "@/components/steal-intro";
import { useEffect, useState } from "react";

/** Pictures for what a crate holds (Sky's art). */
const PIC: Partial<Record<StealKind, string>> = {
  juice: "/art/ui/crystal.webp",
  meat: "/art/icons/meat.webp",
  coins: "/art/ui/coin.webp",
  dice: "/art/ui/dice.webp",
  jackpot: "/art/icons/chest.webp",
  trap: "/art/ui/trap.webp",
};
const SYMBOL: Record<StealKind, string> = { juice: "💎", meat: "🍖", coins: "🪙", dice: "🎲", jackpot: "🎁", trap: "🪤", bomb: "💣", alarm: "⏰" };
/** How long after the raid ends before heading back to the board by itself. */
const BACK_MS = 3200;

function Loot({ box, big = false }: { box: StealBox; big?: boolean }) {
  const pic = PIC[box.kind];
  const size = big ? "size-16" : "size-11";
  return pic ? (
    <img src={pic} alt="" draggable={false} className={cn(size, "object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)]")} />
  ) : (
    <span className={cn(big ? "text-5xl" : "text-4xl", "leading-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)]")}>{SYMBOL[box.kind]}</span>
  );
}

function amountOf(box: StealBox): string {
  if (STEAL_DANGERS.includes(box.kind)) return "";
  if (box.kind === "jackpot") return `+${JACKPOT.coins}🪙 +${JACKPOT.juice}💎`;
  return `+${box.amount}`;
}

/**
 * 🦝 偷嘢 (Sky 2026-10-01): a rival's store at night with six crates on the shelves. Open three: mostly 💎 水晶 and
 * 🍖, a rarer bag of coins or a die, sometimes the 大寶箱 jackpot — and one 老鼠夾 that ends the raid at once.
 * Three of a kind pays double. When it's over the rest open up so you can see what you missed.
 */
export function StealScreen({ state, onPick, onReturn }: { state: GameState; onPick: (index: number) => void; onReturn: () => void }) {
  const { t } = useLang();
  const rival = CHARACTERS[state.rivalFace] ?? CHARACTERS[1];
  const boxes = state.stealBoxes ?? [];
  const opened = state.stealOpened;
  const done = stealDone(state);
  const last = opened.length ? boxes[opened[opened.length - 1]] : null;
  const trapped = last?.kind === "trap";
  const bombed = last?.kind === "bomb";
  const rang = last?.kind === "alarm";
  const hurt = trapped || bombed || rang;
  const left = stealPicksLeft(state);
  const triple =
    opened.length === STEAL_PICKS && opened.every((i) => boxes[i]?.kind === boxes[opened[0]]?.kind) && !STEAL_DANGERS.includes(boxes[opened[0]]?.kind);
  // Arriving from the raccoon's puff of smoke: it clears to show the store.
  const [smoke, setSmoke] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setSmoke(false), 1100);
    return () => window.clearTimeout(id);
  }, []);
  // A moment after the raid ends, the unopened crates show what was inside.
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (!done) return;
    const shown = window.setTimeout(() => setReveal(true), 700);
    const back = window.setTimeout(onReturn, BACK_MS);
    return () => {
      window.clearTimeout(shown);
      window.clearTimeout(back);
    };
  }, [done, onReturn]);

  function open(i: number) {
    if (done || opened.includes(i)) return;
    const box = boxes[i];
    play(STEAL_DANGERS.includes(box.kind) ? "bad" : box.kind === "jackpot" ? "chest" : box.kind === "juice" ? "lucky" : "coin");
    onPick(i);
  }

  // The raccoon reacts to the last crate: a hop for loot, a jolt for the trap.
  const mood = hurt ? "animate-[thief-jolt_0.5s_ease-out]" : last ? "animate-[thief-hop_0.5s_ease-out]" : "animate-[thief-idle_2.4s_ease-in-out_infinite]";

  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col items-center overflow-hidden px-4 text-white"
      style={{
        // A warehouse at night until Sky's picture arrives: moonlight from a high window, dark wooden walls.
        background:
          "radial-gradient(ellipse 60% 30% at 70% 8%, rgba(190,210,255,0.35), transparent 70%), radial-gradient(ellipse 50% 22% at 50% 22%, rgba(255,210,120,0.25), transparent 70%), linear-gradient(#1d1630, #2b1f22 55%, #3a2717 56%, #24170d)",
      }}
      data-testid="steal"
    >
      <header className="mt-[max(env(safe-area-inset-top),1rem)] flex flex-col items-center">
        <img src={rival.avatar} alt="" className="size-14 rounded-full border-[3px] border-[#FBD000] object-cover shadow-[0_0_0_3px_#475569]" />
        <p className="-mt-2 rounded-full border-2 border-[#FBD000] bg-[#475569] px-3 text-sm font-black">{t(rival.name)}</p>
      </header>

      {/* Picks left: three lamps that go out one by one. */}
      <div className="mt-4 flex gap-2" data-testid="steal-left">
        {Array.from({ length: STEAL_PICKS }, (_, k) => (
          <span
            key={k}
            className={cn(
              "size-4 rounded-full border-2 border-[#FBD000] transition",
              k < left && !done ? "bg-[#FBD000] shadow-[0_0_10px_#FBD000]" : "bg-transparent opacity-50",
            )}
          />
        ))}
      </div>

      <p className="mt-2 text-sm font-bold text-white/80">{done ? (trapped ? t("中咗老鼠夾！") : bombed ? t("炸彈！偷到嘅全部冇晒！") : t("得手！快啲走！")) : rang ? t("鬧鐘響！少咗一次機會") : t("開三個箱，小心機關")}</p>

      {/* Nine crates on three shelves. */}
      <div className="mt-4 grid w-full grid-cols-3 gap-x-4 gap-y-6 px-4">
        {boxes.map((box, i) => {
          const isOpen = opened.includes(i);
          const shown = isOpen || reveal;
          return (
            <div key={i} className="relative flex flex-col items-center">
              <button
                type="button"
                disabled={done || isOpen}
                onClick={() => open(i)}
                className={cn(
                  "relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-2xl border-4 transition disabled:cursor-default",
                  shown
                    ? isOpen
                      ? STEAL_DANGERS.includes(box.kind)
                        ? "border-[#ef4444] bg-[#4a1d1d] animate-[smash_0.5s_ease-out]"
                        : "border-[#FBD000] bg-[#5a3a1c] shadow-[0_0_24px_rgba(251,208,0,0.6)]"
                      : "border-[#6b4a2b] bg-[#3a2616] opacity-45"
                    : "border-[#6b4a2b] shadow-[0_6px_0_#2a1a0c] animate-[bump_1.8s_ease-in-out_infinite]",
                )}
                style={
                  shown
                    ? undefined
                    : {
                        animationDelay: `${i * 0.18}s`,
                        background: "repeating-linear-gradient(0deg, #a0703c 0 22%, #8a5c2e 22% 25%), #a0703c",
                      }
                }
                aria-label={t("第 {n} 個箱", { n: i + 1 })}
                data-testid={`crate-${i}`}
              >
                {shown ? (
                  <span className={cn(isOpen && "animate-[pop_0.4s_ease-out]")}>
                    <Loot box={box} big={box.kind === "jackpot"} />
                  </span>
                ) : (
                  <span className="text-3xl font-black text-[#FBD000] drop-shadow-[0_2px_0_#5a3a1c]">?</span>
                )}
                {isOpen && box.kind === "bomb" ? (
                  <img src="/art/fx/boom.webp" alt="" draggable={false} className="pointer-events-none absolute inset-[-60%] max-w-none animate-[pop_0.5s_ease-out] object-contain opacity-90" />
                ) : null}
                {isOpen && box.kind === "jackpot" ? (
                  <span className="pointer-events-none absolute inset-[-40%] animate-[siren_2600ms_linear_infinite] rounded-full opacity-60" style={{ background: "conic-gradient(from 0deg, rgba(251,208,0,0.6) 0 20deg, transparent 20deg 60deg, rgba(251,208,0,0.6) 60deg 80deg, transparent 80deg 120deg, rgba(251,208,0,0.6) 120deg 140deg, transparent 140deg 180deg, rgba(251,208,0,0.6) 180deg 200deg, transparent 200deg 240deg, rgba(251,208,0,0.6) 240deg 260deg, transparent 260deg 300deg, rgba(251,208,0,0.6) 300deg 320deg, transparent 320deg)" }} />
                ) : null}
              </button>
              {shown && amountOf(box) ? (
                <span className={cn("mt-1 text-sm font-black tabular-nums", isOpen ? "text-[#FBD000]" : "text-white/50")}>{amountOf(box)}</span>
              ) : null}
              {/* The shelf under each row. */}
              {i % 3 === 0 ? <span className="pointer-events-none absolute -bottom-3 left-0 h-2 w-[calc(300%+2rem)] rounded bg-[#5a3a1c] shadow-[0_4px_0_#2a1a0c]" /> : null}
            </div>
          );
        })}
      </div>

      {triple ? (
        <p className="mt-6 animate-[pop_0.4s_ease-out] rounded-full bg-[#FBD000] px-4 py-1 text-lg font-black text-[#7a3d00]" data-testid="steal-triple">
          {t("三個一樣！雙倍！")}
        </p>
      ) : null}

      {/* The raccoon, bottom left, reacting to each crate. */}
      <img
        src="/art/fx/thief.webp"
        alt=""
        draggable={false}
        key={opened.length}
        className={cn("pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),0.5rem)] left-1 w-36 object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.6)]", mood)}
      />

      {done ? (
        <button
          type="button"
          onClick={onReturn}
          className="relative z-10 mt-auto mb-[max(env(safe-area-inset-bottom),1.25rem)] ml-auto h-12 w-1/2 cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#049CD8] text-lg font-black shadow-[0_5px_0_#1E3A8A]"
          data-testid="steal-return"
        >
          {t("返回棋盤")}
        </button>
      ) : null}
      {smoke ? (
        <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
          <SmokeCloud mode="out" delay={150} />
        </div>
      ) : null}
    </main>
  );
}
