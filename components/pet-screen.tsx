"use client";

import { PetView } from "@/components/pet-view";

/** Drawn dragons by attribute and stage (1 N … 4 SSR); stages without a picture yet use the 3D model. */
const DRAGON_ART: Record<string, string> = {
  "light-1": "/art/dragons/light-1.webp",
  "dark-1": "/art/dragons/dark-1.webp",
  "chaos-1": "/art/dragons/chaos-1.webp",
  "light-2": "/art/dragons/light-2.webp",
  "dark-2": "/art/dragons/dark-2.webp",
  "chaos-2": "/art/dragons/chaos-2.webp",
  "light-3": "/art/dragons/light-3.webp",
  "dark-3": "/art/dragons/dark-3.webp",
  "chaos-3": "/art/dragons/chaos-3.webp",
};
import { holdsNft, type GameState } from "@/lib/game";
import { useLang } from "@/lib/i18n";
import { ELEMENTS, HATCH_ROLLS, HUNGRY_DROP, STAGE_NAMES, UPKEEP, growNeed, petAttack, petName, rollElement } from "@/lib/pet";
import { play } from "@/lib/sfx";
import { cn } from "cn";

/** Your dragon: take a dragon egg (its attribute is random), then feed it 🍖 and 💎 to grow it from 龍蛋 to SSR. */
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
          <span className="flex items-center gap-1 rounded-full border-2 border-[#FBD000] bg-white px-2.5 py-0.5 text-[#1E3A8A]">
            <img src="/art/icons/meat.webp" alt="" className="-my-1 size-6 object-contain" /> {state.meat}
          </span>
          <span className="flex items-center gap-1 rounded-full border-2 border-[#FBD000] bg-white px-2.5 py-0.5 text-[#1E3A8A]">
            <img src="/art/ui/crystal.webp" alt="" className="-my-1 size-6 object-contain" /> {state.juice}
          </span>
        </div>
      </header>

      {pet ? (
        <>
          <div className="relative min-h-0 flex-1">
            {DRAGON_ART[`${ELEMENTS[pet.element].id}-${pet.stage}`] ? (
              // Sky's drawn dragon for this attribute and stage (2026-10-01), breathing gently.
              <div className="absolute inset-0 flex items-center justify-center">
                <img
                  src={DRAGON_ART[`${ELEMENTS[pet.element].id}-${pet.stage}`]}
                  alt=""
                  draggable={false}
                  className="h-[78%] max-h-80 animate-[thief-idle_2.4s_ease-in-out_infinite] object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,0.35)]"
                  data-testid="pet-art"
                />
              </div>
            ) : (
              <PetView key={`${pet.element}-${pet.stage}-${legend}`} element={pet.element} stage={pet.stage} legend={legend} />
            )}
            {pet.stage > 0 ? (
              <span
                className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border-2 border-white/70 px-3 py-0.5 text-sm font-black text-white shadow"
                style={{ background: ELEMENTS[pet.element].colour }}
                data-testid="pet-element"
              >
                {t("{e}屬性", { e: t(ELEMENTS[pet.element].name) })}
              </span>
            ) : (
              <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/40 px-3 py-0.5 text-sm font-black text-white" data-testid="pet-element">
                {t("屬性：？孵出嚟先知")}
              </span>
            )}
          </div>
          <section className="space-y-2 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 text-[#1E3A8A]">
            <div className="flex items-baseline justify-between">
              <h1 className="text-xl font-black" data-testid="pet-name">
                {pet.stage === 0 ? t("龍蛋") : `${t(petName(pet, legend))} · ${STAGE_NAMES[pet.stage]}`}
              </h1>
              <span className="text-sm font-black">⚔️ {petAttack(pet, legend)}</span>
            </div>
            <p className={cn("text-sm font-bold", pet.hungry > 0 ? "text-[#E52521]" : "text-[#16A34A]")} data-testid="pet-mood">
              {pet.stage === 0
                ? t("龍蛋唔使食嘢。")
                : pet.hungry > 0
                  ? t("肚餓！（{n}／{m}）再餓落去會跌階段", { n: pet.hungry, m: HUNGRY_DROP })
                  : t("飽飽，精神好")}
            </p>
            {pet.stage > 0 ? (
              <p className="text-xs font-bold text-[#3B5BA9]">
                {t("每日食 {m} 🍖 同 {j} 💎（自動由倉庫扣）", { m: UPKEEP[pet.stage][0], j: UPKEEP[pet.stage][1] })}
              </p>
            ) : null}
            {pet.stage === 0 ? (
              <div className="space-y-1.5" data-testid="hatch-progress">
                <p className="text-sm font-black">{t("喺棋盤擲夠 {n} 次骰就會自己孵出嚟：", { n: HATCH_ROLLS })}</p>
                <div className="flex items-center gap-2 text-sm font-black tabular-nums">
                  <span className="w-6">🥚</span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-[#E3E9F3]">
                    <span className="block h-full rounded-full bg-[#F59E0B]" style={{ width: `${Math.min(100, (pet.rolls / HATCH_ROLLS) * 100)}%` }} />
                  </span>
                  <span className="w-16 text-right">
                    {pet.rolls}／{HATCH_ROLLS}
                  </span>
                </div>
                <p className="text-center text-xs font-bold text-[#3B5BA9]">{t("公開桌擲骰唔計。")}</p>
              </div>
            ) : need ? (
              <>
                <p className="text-sm font-black">{t("長大做「{s}」要：", { s: t(STAGE_NAMES[pet.stage + 1]) })}</p>
                {[
                  { icon: "/art/icons/meat.webp", have: state.meat, want: need[0] },
                  { icon: "/art/ui/crystal.webp", have: state.juice, want: need[1] },
                ].map((bar) => (
                  <div key={bar.icon} className="flex items-center gap-2 text-sm font-black tabular-nums">
                    <img src={bar.icon} alt="" className="size-6 object-contain" />
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
                  {t("🍖 餵大佢！")}
                </button>
                <p className="text-center text-xs font-bold text-[#3B5BA9]">{t("🍖 喺棋盤肉格攞；💎 水晶要去偷嘢格偷返嚟。")}</p>
              </>
            ) : (
              <p className="text-center text-lg font-black text-[#D97706]">{t("👑 已經係 SSR！")}</p>
            )}
          </section>
        </>
      ) : (
        <>
          <h1 className="mt-3 text-center text-2xl font-black drop-shadow">{t("領取你嘅龍蛋")}</h1>
          <div className="relative min-h-0 flex-1">
            <PetView key="new-egg" element={0} stage={0} />
          </div>
          <section className="space-y-3 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 text-[#1E3A8A]">
            <div className="grid grid-cols-3 gap-2" data-testid="odds">
              {ELEMENTS.map((element) => (
                <div key={element.id} className="flex flex-col items-center rounded-2xl bg-[#F1F4F9] py-1.5">
                  <span className="text-xl font-black" style={{ color: element.colour }}>
                    {t(element.name)}
                  </span>
                  <span className="text-xs font-black tabular-nums">{Math.round(element.chance * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="text-center text-xs font-bold text-[#3B5BA9]">
              {legend ? t("你有 NFT：孵出嚟係傳說系列，攻擊力多一成。") : t("屬性隨機，孵出嚟先知。領咗之後喺棋盤擲 60 次骰就孵化，一出世就識飛。")}
            </p>
            <button
              type="button"
              onClick={() => {
                play("chest");
                onPick(rollElement(Math.random()));
              }}
              className="h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#E52521] text-xl font-black text-white shadow-[0_5px_0_#8E1210]"
              data-testid="pick-pet"
            >
              {t("🥚 領取龍蛋！")}
            </button>
          </section>
        </>
      )}
    </main>
  );
}
