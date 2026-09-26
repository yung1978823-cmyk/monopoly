"use client";

import { Building, LevelPips } from "@/components/building";
import { TipHand } from "@/components/tip-hand";
import { FX_ART, LANDMARK_NAMES, TILE_INFO } from "@/lib/board";
import { CITIES } from "@/lib/cities";
import { canUpgrade, isRepair, upgradeCost, type GameState } from "@/lib/game";
import { MAX_LEVEL } from "@/lib/rules";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useState } from "react";

/** Your own town: the builder's construction site, one building per plot. */
export const HOME_CITY = CITIES[2];

/**
 * Your town, drawn on the same kind of scene as the rivals' towns. Tap a building (on the scene
 * or on its card below) to raise it a level; knocked-down levels come back at half price.
 */
export function MyCity({
  state,
  onUpgrade,
  onClose,
}: {
  state: GameState;
  onUpgrade: (building: number) => void;
  onClose: () => void;
}) {
  const city = HOME_CITY;
  const { t } = useLang();
  const [raised, setRaised] = useState<{ building: number; key: number } | null>(null);
  const firstTime = state.levels.every((level) => level === 0);

  function raise(building: number) {
    if (!canUpgrade(state, building)) return;
    onUpgrade(building);
    play("build");
    setRaised({ building, key: Date.now() });
  }

  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden [container-type:size]"
      style={{ background: `linear-gradient(${city.sky} 0 50%, ${city.ground} 50% 100%)` }}
      data-testid="my-city"
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[58%] bg-cover bg-center"
        style={{
          backgroundImage: `url(${city.art})`,
          width: `min(100cqw, calc(100cqh * ${city.width / city.height}))`,
          aspectRatio: `${city.width} / ${city.height}`,
        }}
      >
        {city.plots.map((spot, building) => {
          const level = state.levels[building] ?? 0;
          const place = { left: `${spot.x * 100}%`, top: `${spot.y * 100}%` };
          const justRaised = raised?.building === building;
          return (
            <button
              key={building}
              type="button"
              onClick={() => raise(building)}
              className="absolute flex -translate-x-1/2 -translate-y-[80%] cursor-pointer flex-col items-center"
              style={place}
              aria-label={t("{b}，第 {n} 級", { b: t(LANDMARK_NAMES[building]), n: level })}
              data-testid={`plot-${building}`}
            >
              {level > 0 ? (
                <span key={justRaised ? raised.key : 0} className={cn(justRaised && "animate-[pop_0.4s_ease-out]")}>
                  <Building level={level} className="text-[min(15cqw,4rem)]" />
                </span>
              ) : (
                <span className="flex size-[min(12cqw,3.2rem)] translate-y-1/2 items-center justify-center rounded-full border-[3px] border-dashed border-white bg-white/30 text-2xl font-black text-white">
                  +
                </span>
              )}
              {level > 0 ? <LevelPips level={level} best={state.best[building]} className="mt-1" /> : null}
              {justRaised ? (
                <img
                  key={raised.key}
                  src={FX_ART.sparkle}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 size-[min(30cqw,8rem)] max-w-none -translate-x-1/2 -translate-y-1/2 animate-[sparkle_0.9s_ease-out_both]"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Top: back to the board, and your money. */}
      <header className="relative z-10 flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-2xl font-black text-white shadow-md"
          aria-label={t("返回棋盤")}
          data-testid="city-back"
        >
          ←
        </button>
        <div className="flex items-center gap-1.5 rounded-full border-2 border-[#FBD000] bg-white py-1 pl-1.5 pr-3 text-lg font-black tabular-nums text-[#1E3A8A] shadow-md">
          <img src={TILE_INFO.coin.art} alt={t("金幣")} className="size-6" />
          <span key={state.points} className="inline-block animate-[bump_0.35s_ease-out]">
            {state.points}
          </span>
        </div>
        <span className="size-11" aria-hidden />
      </header>

      {/* Bottom: one card per building — its next level, its level dots and the price. */}
      <footer className="relative z-10 mt-auto grid grid-cols-3 gap-2 rounded-t-[32px] bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-3 shadow-[0_-6px_20px_rgba(30,58,138,0.25)]">
        {state.levels.map((level, building) => {
          const cost = upgradeCost(state, building);
          const affordable = canUpgrade(state, building);
          const repair = isRepair(state, building);
          const maxed = level >= MAX_LEVEL;
          return (
            <button
              key={building}
              type="button"
              onClick={() => raise(building)}
              disabled={!affordable}
              className={cn(
                "relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-[3px] px-1 pb-1.5 pt-2 transition-transform active:translate-y-0.5 disabled:cursor-default",
                affordable ? "border-[#FBD000] bg-[#FFF8D6] shadow-[0_4px_0_#E0A800]" : "border-[#D6DEEA] bg-[#F1F4F9]",
              )}
              aria-label={maxed ? t("{b}已經最高級", { b: t(LANDMARK_NAMES[building]) }) : t(repair ? "修返{b}，要 {n} 金幣" : "升級{b}，要 {n} 金幣", { b: t(LANDMARK_NAMES[building]), n: cost ?? 0 })}
              data-testid={`upgrade-${building}`}
            >
              {firstTime && affordable && building === 0 ? <TipHand className="-top-11 left-1/2 -translate-x-1/2" /> : null}
              <span className={cn("flex h-12 items-end", !affordable && !maxed && "opacity-50 grayscale")}>
                <Building level={maxed ? level : level + 1} className="text-4xl" />
              </span>
              {repair ? <span className="absolute right-1 top-1 text-lg" aria-hidden>🔧</span> : null}
              <LevelPips level={level} best={state.best[building]} />
              {maxed ? (
                <span className="text-lg" aria-hidden>👑</span>
              ) : (
                <span className="flex items-center gap-0.5 text-sm font-black tabular-nums text-[#1E3A8A]">
                  <img src={TILE_INFO.coin.art} alt="" className="size-4" />
                  {cost}
                </span>
              )}
            </button>
          );
        })}
      </footer>
    </main>
  );
}
