"use client";

import { TipHand } from "@/components/tip-hand";
import { FX_ART, LANDMARK_NAMES, TILE_INFO } from "@/lib/board";
import { CITIES } from "@/lib/cities";
import { ShieldFx } from "@/components/shield-fx";
import { Building, LevelPips } from "@/components/building";
import { standingIndexes, type GameState } from "@/lib/game";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useEffect, useState } from "react";

type Flash = { kind: "shield" | "smash" | "hit" | "miss"; key: number };

const FLASH_MS = 1500;
const SHIELD_MS = 1200;
/** Pause after the last pop-up before heading back to the board on its own. */
const RETURN_MS = 700;

/**
 * The rival's city: their buildings drawn on the city art at their levels. One tap on a building settles the
 * fight; a hit breaks the shield (if any) on the way to smashing it, then you go back to the board.
 */
export function AttackScreen({
  state,
  onStrike,
  onReturn,
}: {
  state: GameState;
  onStrike: (target: number | null) => void;
  onReturn: () => void;
}) {
  const city = CITIES[state.rivalCity] ?? CITIES[0];
  const readout = state.weaponReadout;
  const standing = standingIndexes(state.rivalLevels);
  const picking = !state.fightSettled && standing.length > 0;
  const { t } = useLang();
  const [flash, setFlash] = useState<Flash | null>(null);
  const [aimed, setAimed] = useState<number | null>(null);

  // Play the result once: the shield pop-up first if it broke, then the smash, hit or miss,
  // and then head back to the board by itself.
  useEffect(() => {
    if (!readout) return;
    const kind: Flash["kind"] = readout.smashed !== null ? "smash" : readout.hit ? "hit" : "miss";
    const lead = readout.shieldBreak ? SHIELD_MS : 0;
    const blocked = !readout.hit && state.enemyShield;
    const sound = kind === "smash" ? "smash" : kind === "hit" ? "coin" : blocked ? "shield" : "miss";
    const timers = [
      readout.shieldBreak
        ? window.setTimeout(() => {
            play("shield");
            setFlash({ kind: "shield", key: Date.now() });
          }, 0)
        : 0,
      window.setTimeout(() => {
        play(sound);
        setFlash({ kind, key: Date.now() + 1 });
      }, lead),
      window.setTimeout(() => setFlash(null), lead + FLASH_MS),
      window.setTimeout(onReturn, lead + FLASH_MS + RETURN_MS),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
    // Only a new strike result should replay this; the shield flag is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readout, onReturn]);

  function strike(target: number | null) {
    if (state.fightSettled) return;
    setAimed(target);
    onStrike(target);
  }

  const status = state.fightSettled
    ? readout?.smashed != null
      ? t("{b}跌咗一級！", { b: t(LANDMARK_NAMES[readout.smashed]) })
      : readout?.hit
        ? t("打中！")
        : t("打唔中……")
    : standing.length > 0
      ? `${state.enemyShield ? "🛡️ " : ""}${t("撳一座建築 🔨")}`
      : t("一座建築都冇，直接打！");

  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden [container-type:size]"
      style={{ background: `linear-gradient(${city.sky} 0 50%, ${city.ground} 50% 100%)` }}
      data-testid="search"
    >
      {/* City art, fitted inside the screen, with the landmark targets on it. */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[56%] bg-cover bg-center",
          // The whole town shudders when a building goes down.
          flash?.kind === "smash" && "animate-[smash_0.5s_ease-out]",
        )}
        style={{
          backgroundImage: `url(${city.art})`,
          width: `min(100cqw, calc(100cqh * ${city.width / city.height}))`,
          aspectRatio: `${city.width} / ${city.height}`,
        }}
      >
        {city.plots.map((spot, index) => {
          const level = state.rivalLevels[index] ?? 0;
          const smashedNow = flash?.kind === "smash" && readout?.smashed === index;
          const place = { left: `${spot.x * 100}%`, top: `${spot.y * 100}%` };
          if (level === 0) {
            // An empty plot, or one just knocked flat: the explosion lingers where it stood.
            return readout?.smashed === index ? (
              <img
                key={index}
                src={FX_ART.smash}
                alt=""
                draggable={false}
                className="absolute size-[min(18cqw,5rem)] -translate-x-1/2 -translate-y-[70%] object-contain animate-[smash_0.5s_ease-out]"
                style={place}
                data-testid={`ruined-${index}`}
              />
            ) : null;
          }
          return (
            <button
              key={index}
              type="button"
              disabled={!picking}
              onClick={() => strike(index)}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-[75%] flex-col items-center",
                picking ? "cursor-pointer" : "cursor-default",
              )}
              style={place}
              aria-label={t("攻擊{b}", { b: t(LANDMARK_NAMES[index]) })}
              data-testid={`target-${index}`}
            >
              <span className={cn(smashedNow && "animate-[smash_0.5s_ease-out]")}>
                <Building level={level} className="text-[min(14cqw,3.8rem)]" />
              </span>
              <LevelPips level={level} className="mt-1" />
              {smashedNow ? (
                <img
                  src={FX_ART.smash}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/3 size-[min(22cqw,6rem)] max-w-none -translate-x-1/2 -translate-y-1/2 animate-[pop_0.3s_ease-out]"
                />
              ) : null}
              {/* Small target ring over the building. */}
              <span
                className={cn(
                  "absolute left-1/2 top-[40%] size-[min(9cqw,2.4rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(229,37,33,0.9),inset_0_0_0_2px_rgba(229,37,33,0.9)]",
                  picking ? "animate-pulse" : "opacity-0",
                )}
              />
              {picking && state.strikes === 0 && index === standing[0] ? (
                <TipHand className="-top-12 left-1/2 -translate-x-1/2" />
              ) : null}
              {aimed === index && state.fightSettled ? (
                <span className="absolute -top-8 text-3xl animate-[hammer_0.6s_ease-out]">🔨</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Rival: framed face and name, small, centred at the top. */}
      <header className="relative z-10 mx-auto mt-[max(env(safe-area-inset-top),0.75rem)] flex flex-col items-center" data-testid="rival">
        <img
          src={city.rival.avatar}
          alt=""
          draggable={false}
          className="size-16 rounded-full border-[3px] border-[#FBD000] object-cover shadow-[0_0_0_3px_#E52521,0_6px_12px_rgba(0,0,0,0.3)]"
        />
        <p className="-mt-2 rounded-full border-2 border-[#FBD000] bg-[#E52521] px-3 text-sm font-black text-white shadow-md">
          {t(city.rival.name)}
        </p>
      </header>

      {/* Bottom panel: what to do, what it paid, and the next action. */}
      <footer className="relative z-10 mt-auto space-y-2 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-3 shadow-[0_-6px_20px_rgba(30,58,138,0.25)]">
        <p className="text-center text-base font-black text-[#E52521]" data-testid="attack-status">
          {status}
        </p>
        {readout ? (
          <p className="flex items-center justify-center gap-2 text-sm font-bold text-[#1E3A8A]" data-testid="dst-pay">
            <span className="flex items-center gap-1">
              <img src={TILE_INFO.coin.art} alt={t("金幣")} className="size-5" />+{readout.pointsGained}
            </span>
            {readout.dst > 0 ? <span>· {t("搬走 {n} DST", { n: readout.dst })}</span> : null}
          </p>
        ) : null}
        {state.fightSettled ? (
          <button
            type="button"
            onClick={onReturn}
            className="h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#049CD8] text-xl font-black text-white shadow-[0_5px_0_#1E3A8A] active:translate-y-1 active:shadow-[0_1px_0_#1E3A8A]"
            data-testid="return-walk"
          >
            {t("返回棋盤")}
          </button>
        ) : picking ? null : (
          <div className="relative">
            {state.strikes === 0 ? <TipHand className="-top-12 left-1/2 -translate-x-1/2" /> : null}
            <button
              type="button"
              onClick={() => strike(null)}
              className="h-16 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#E52521] text-2xl font-black text-white shadow-[0_6px_0_#8E1210] active:translate-y-1 active:shadow-[0_2px_0_#8E1210]"
              data-testid="weapon"
            >
              {t("🔨 攻擊")}
            </button>
          </div>
        )}
      </footer>

      {/* Strike result pop-up. */}
      {flash ? (
        <div
          key={flash.key}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          data-testid={`flash-${flash.kind}`}
        >
          {flash.kind === "shield" ? (
            <ShieldFx broken />
          ) : flash.kind === "miss" && state.enemyShield ? (
            <ShieldFx broken={false} />
          ) : (
            <p
              className={cn(
                "animate-[pop_0.45s_ease-out] rounded-3xl border-4 border-[#FBD000] px-8 py-4 text-4xl font-black text-white shadow-2xl",
                flash.kind === "miss" ? "bg-[#3B5BA9]" : "bg-[#E52521]",
              )}
            >
              {flash.kind === "smash"
                ? t("💥 跌一級！")
                : flash.kind === "hit"
                  ? t("打中！")
                  : t("打唔中")}
            </p>
          )}
        </div>
      ) : null}
    </main>
  );
}
