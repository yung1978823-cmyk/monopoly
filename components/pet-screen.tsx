"use client";

import { PetView } from "@/components/pet-view";
import { holdsNft, type GameState } from "@/lib/game";
import { useLang } from "@/lib/i18n";
import { ELEMENTS, HUNGRY_DROP, STAGE_NAMES, UPKEEP, growNeed, petAttack, petName } from "@/lib/pet";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useState } from "react";

/** Your monster: pick one (first time), then feed it 🍖 and 🧪 to grow it through five stages. */
export function PetScreen({
  state,
  onPick,
  onGrow,
  onClose,
}: {
  state: GameState;
  onPick: (element: number) => void;
  onGrow: () => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const legend = holdsNft(state);
  const [choice, setChoice] = useState(0);
  const pet = state.pet;
  const need = pet ? growNeed(pet) : null;
  const canGrow = !!need && state.meat >= need[0] && state.juice >= need[1];

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#3d6fb0] via-[#1d3560] to-[#0b1428] text-white" data-testid="pet-screen">
      <header className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-2xl font-black text-white shadow-md"
          aria-label={t("返回棋盤")}
          data-testid="pet-back"
        >
          ←
        </button>
        <div className="flex items-center gap-2 text-base font-black tabular-nums" data-testid="pet-store">
          <span className="rounded-full border-2 border-[#FBD000] bg-white px-2.5 py-0.5 text-[#1E3A8A]">🍖 {state.meat}</span>
          <span className="rounded-full border-2 border-[#FBD000] bg-white px-2.5 py-0.5 text-[#1E3A8A]">🧪 {state.juice}</span>
        </div>
      </header>

      {pet ? (
        <>
          <div className="relative min-h-0 flex-1">
            <PetView key={`${pet.element}-${pet.stage}-${legend}`} element={pet.element} stage={pet.stage} legend={legend} />
          </div>
          <section className="space-y-2 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 text-[#1E3A8A]">
            <div className="flex items-baseline justify-between">
              <h1 className="text-xl font-black" data-testid="pet-name">
                {t(petName(pet, legend))} · {t(STAGE_NAMES[pet.stage])}
              </h1>
              <span className="text-sm font-black">⚔️ {petAttack(pet, legend)}</span>
            </div>
            <p className={cn("text-sm font-bold", pet.hungry > 0 ? "text-[#E52521]" : "text-[#16A34A]")} data-testid="pet-mood">
              {pet.stage === 0
                ? t("蛋唔使食嘢，餵夠就孵出嚟。")
                : pet.hungry > 0
                  ? t("肚餓！（{n}／{m}）再餓落去會跌階段", { n: pet.hungry, m: HUNGRY_DROP })
                  : t("飽飽，精神好")}
            </p>
            {pet.stage > 0 ? (
              <p className="text-xs font-bold text-[#3B5BA9]">
                {t("每日食 {m} 🍖 同 {j} 🧪（自動由倉庫扣）", { m: UPKEEP[pet.stage][0], j: UPKEEP[pet.stage][1] })}
              </p>
            ) : null}
            {need ? (
              <>
                <p className="text-sm font-black">{t("長大做「{s}」要：", { s: t(STAGE_NAMES[pet.stage + 1]) })}</p>
                {[
                  { icon: "🍖", have: state.meat, want: need[0] },
                  { icon: "🧪", have: state.juice, want: need[1] },
                ].map((bar) => (
                  <div key={bar.icon} className="flex items-center gap-2 text-sm font-black tabular-nums">
                    <span className="w-6">{bar.icon}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-[#E3E9F3]">
                      <span className="block h-full rounded-full bg-[#16A34A]" style={{ width: `${Math.min(100, (bar.have / bar.want) * 100)}%` }} />
                    </span>
                    <span className="w-16 text-right">
                      {bar.have}／{bar.want}
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={!canGrow}
                  onClick={() => {
                    play("chest");
                    onGrow();
                  }}
                  className={cn(
                    "h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] text-xl font-black text-white disabled:cursor-default",
                    canGrow ? "animate-[glow_1.8s_ease-in-out_infinite] bg-[#16A34A] shadow-[0_5px_0_#166534]" : "bg-[#94A3B8]",
                  )}
                  data-testid="grow-pet"
                >
                  {pet.stage === 0 ? t("🥚 孵佢出嚟！") : t("🍖 餵大佢！")}
                </button>
                <p className="text-center text-xs font-bold text-[#3B5BA9]">{t("🍖 喺棋盤肉格攞；🧪 營養液要去偷嘢格偷返嚟。")}</p>
              </>
            ) : (
              <p className="text-center text-lg font-black text-[#D97706]">{t("👑 已經係王者！")}</p>
            )}
          </section>
        </>
      ) : (
        <>
          <h1 className="mt-3 text-center text-2xl font-black drop-shadow">{t("揀你嘅怪獸")}</h1>
          <div className="relative min-h-0 flex-1">
            <PetView key={`pick-${choice}-${legend}`} element={choice} stage={1} legend={legend} />
          </div>
          <section className="space-y-3 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 text-[#1E3A8A]">
            <div className="grid grid-cols-5 gap-2">
              {ELEMENTS.map((element, i) => (
                <button
                  key={element.id}
                  type="button"
                  onClick={() => setChoice(i)}
                  aria-pressed={choice === i}
                  className={cn(
                    "flex cursor-pointer flex-col items-center rounded-2xl border-[3px] py-1.5 text-2xl font-black transition",
                    choice === i ? "scale-105 border-[#FBD000] bg-[#FFF8D6]" : "border-transparent bg-[#F1F4F9] opacity-80",
                  )}
                  style={{ color: element.colour }}
                  data-testid={`element-${i}`}
                >
                  {t(element.name)}
                </button>
              ))}
            </div>
            <p className="text-center text-lg font-black" data-testid="pick-name">
              {t(legend ? ELEMENTS[choice].legend : ELEMENTS[choice].beast)}
            </p>
            <p className="text-center text-xs font-bold text-[#3B5BA9]">
              {legend ? t("你有 NFT：你隻係傳說系列，攻擊力多一成。") : t("由蛋開始，養大會變強，共五個階段。")}
            </p>
            <button
              type="button"
              onClick={() => {
                play("chest");
                onPick(choice);
              }}
              className="h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#E52521] text-xl font-black text-white shadow-[0_5px_0_#8E1210]"
              data-testid="pick-pet"
            >
              {t("就揀佢！")}
            </button>
          </section>
        </>
      )}
    </main>
  );
}
