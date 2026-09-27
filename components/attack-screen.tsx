"use client";

import { TipHand } from "@/components/tip-hand";
import { LANDMARK_NAMES, TILE_INFO } from "@/lib/board";
import { CityView } from "@/components/city-view";
import { CHARACTERS } from "@/lib/characters";
import { THEMES } from "@/lib/themes";
import { ShieldFx } from "@/components/shield-fx";
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
  const rival = CHARACTERS[state.rivalFace] ?? CHARACTERS[1];
  const theme = THEMES[state.rivalCity] ?? THEMES[0];
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
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#0B1B3F] [container-type:size]"
      data-testid="search"
    >
      {/* The rival's town page in 3D: tap a building to strike it. */}
      <div className={cn("absolute inset-0", flash?.kind === "smash" && "animate-[smash_0.5s_ease-out]")}>
        <CityView
          theme={state.rivalCity}
          levels={state.rivalLevels}
          targets={picking}
          onPick={(index) => {
            if (picking && standing.includes(index)) strike(index);
          }}
          smash={readout?.smashed ?? null}
          smashKey={flash?.kind === "smash" ? flash.key : 0}
        />
      </div>
      {/* The same targets as buttons, for keyboards and screen readers. */}
      <div className="sr-only">
        {standing.map((index) => (
          <button
            key={index}
            type="button"
            disabled={!picking}
            onClick={() => strike(index)}
            aria-label={t("攻擊{b}", { b: t(LANDMARK_NAMES[index]) })}
            data-testid={`target-${index}`}
          />
        ))}
      </div>
      {picking && state.strikes === 0 ? <TipHand className="left-1/2 top-[40%] z-20 -translate-x-1/2" /> : null}
      {aimed !== null && state.fightSettled ? (
        <span className="pointer-events-none absolute left-1/2 top-[38%] z-20 -translate-x-1/2 text-5xl animate-[hammer_0.6s_ease-out]">🔨</span>
      ) : null}

      {/* Rival: framed face and name, small, centred at the top. */}
      <header className="relative z-10 mx-auto mt-[max(env(safe-area-inset-top),0.75rem)] flex flex-col items-center" data-testid="rival">
        <img
          src={rival.avatar}
          alt=""
          draggable={false}
          className="size-16 rounded-full border-[3px] border-[#FBD000] object-cover shadow-[0_0_0_3px_#E52521,0_6px_12px_rgba(0,0,0,0.3)]"
        />
        <p className="-mt-2 rounded-full border-2 border-[#FBD000] bg-[#E52521] px-3 text-sm font-black text-white shadow-md">
          {t(rival.name)}
        </p>
        <p className="mt-1 rounded-full bg-[#1E3A8A]/80 px-2 text-xs font-black text-white" data-testid="rival-theme">
          {t(theme.name)} · {t("第 {n} 頁", { n: state.rivalCity + 1 })}
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
