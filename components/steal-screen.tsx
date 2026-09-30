"use client";

import { CHARACTERS } from "@/lib/characters";
import { type GameState } from "@/lib/game";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { SmokeCloud } from "@/components/steal-intro";
import { useEffect, useState } from "react";

const ICON = { juice: "🧪", meat: "🍖", coins: "🪙" } as const;
const BACK_MS = 2200;

/** 🦝 偷嘢: sneak into a rival's store and take one of three crates — mostly 🧪 營養液. */
export function StealScreen({ state, onPick, onReturn }: { state: GameState; onPick: (index: number) => void; onReturn: () => void }) {
  const { t } = useLang();
  const rival = CHARACTERS[state.rivalFace] ?? CHARACTERS[1];
  const boxes = state.stealBoxes ?? [];
  const picked = state.stealPicked;
  // Arriving from the raccoon's puff of smoke: it clears to show the store.
  const [smoke, setSmoke] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setSmoke(false), 1100);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (picked === null) return;
    const id = window.setTimeout(onReturn, BACK_MS);
    return () => window.clearTimeout(id);
  }, [picked, onReturn]);

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col items-center overflow-hidden bg-gradient-to-b from-[#2a1f3d] via-[#3b2a52] to-[#140d1f] px-4 text-white" data-testid="steal">
      <header className="mt-[max(env(safe-area-inset-top),1rem)] flex flex-col items-center">
        <img src={rival.avatar} alt="" className="size-16 rounded-full border-[3px] border-[#FBD000] object-cover shadow-[0_0_0_3px_#475569]" />
        <p className="-mt-2 rounded-full border-2 border-[#FBD000] bg-[#475569] px-3 text-sm font-black">{t(rival.name)}</p>
      </header>
      <h1 className="mt-6 text-center text-2xl font-black drop-shadow">{t("🦝 潛入咗{name}嘅倉庫！", { name: t(rival.name) })}</h1>
      <p className="mt-1 text-center text-sm font-bold text-white/80">{picked === null ? t("揀一個箱偷走") : t("得手！快啲走！")}</p>

      <div className="mt-10 grid w-full grid-cols-3 gap-3">
        {boxes.map((box, i) => {
          const open = picked !== null;
          const mine = picked === i;
          return (
            <button
              key={i}
              type="button"
              disabled={open}
              onClick={() => {
                play(box.kind === "juice" ? "lucky" : "coin");
                onPick(i);
              }}
              className={cn(
                "flex aspect-[4/5] cursor-pointer flex-col items-center justify-center rounded-3xl border-4 text-5xl shadow-[0_8px_0_#3a2410] transition disabled:cursor-default",
                open ? (mine ? "scale-110 border-[#FBD000] bg-[#fff3c4]" : "border-[#6b4a2b] bg-[#8b6b4a] opacity-50") : "animate-[bump_1.6s_ease-in-out_infinite] border-[#6b4a2b] bg-[#a0703c]",
              )}
              style={{ animationDelay: `${i * 0.2}s` }}
              aria-label={t("第 {n} 個箱", { n: i + 1 })}
              data-testid={`crate-${i}`}
            >
              {open ? (
                <>
                  <span className={cn(mine && "animate-[pop_0.4s_ease-out]")}>{ICON[box.kind]}</span>
                  <span className={cn("mt-1 text-lg font-black", mine ? "text-[#1E3A8A]" : "text-white")}>+{box.amount}</span>
                </>
              ) : (
                "📦"
              )}
            </button>
          );
        })}
      </div>

      {picked !== null ? (
        <button
          type="button"
          onClick={onReturn}
          className="mt-auto mb-[max(env(safe-area-inset-bottom),1.25rem)] h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#049CD8] text-xl font-black shadow-[0_5px_0_#1E3A8A]"
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
