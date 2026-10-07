"use client";

import { TipHand } from "@/components/tip-hand";
import { LANDMARK_NAMES } from "@/lib/board";
import { ENERGY_ICON, coinEnergy, formatEnergy } from "@/lib/energy";
import { CityView } from "@/components/city-view";
import { CHARACTERS } from "@/lib/characters";
import { previewTheme, themeOf, THEMES } from "@/lib/themes";
import { FIRE_MS } from "@/components/city-scene";
import { CloudWall } from "@/components/attack-intro";
import { holdsNft, matchUp, standingIndexes, totalLevels, type GameState } from "@/lib/game";
import { ELEMENTS, TYPE_EDGE } from "@/lib/pet";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useEffect, useState } from "react";

type Shot = { at: number | null; result: "smash" | "block" | "break" | "hit"; key: number };

/** How long the explosion (or the shield) plays after the fireball lands. */
const AFTER_MS = 1700;
/** Pause after that before heading back to the board on its own. */
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
  /** The preview link (?city=greece) shows that page's name too, matching the island it draws. */
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setPreview(previewTheme()), 0);
    return () => window.clearTimeout(id);
  }, []);
  const shownName = preview !== null ? themeOf(preview).name : theme.name;
  const edge = matchUp(state);
  const readout = state.weaponReadout;
  const standing = standingIndexes(state.rivalLevels);
  const picking = !state.fightSettled && standing.length > 0;
  const { t } = useLang();
  const [aimed, setAimed] = useState<number | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  /** The rival's levels from before the strike, shown until the fireball lands (then the building drops). */
  const [held, setHeld] = useState<readonly number[] | null>(null);
  const [quake, setQuake] = useState(false);
  // Arriving from the 突襲 intro: the cloud wall parts to show the rival's island.
  const [clouds, setClouds] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setClouds(false), 1100);
    return () => window.clearTimeout(id);
  }, []);

  // No words over the island (Sky 2026-09-30): your dragon breathes a fireball. A hit blows the building up and it
  // drops a level; a miss is stopped by a glowing shield; a shield that breaks shatters first. Then back to the board.
  useEffect(() => {
    if (!readout) return;
    const result: Shot["result"] =
      readout.smashed !== null ? (readout.shieldBreak ? "break" : "smash") : readout.hit ? (readout.shieldBreak ? "break" : "hit") : "block";
    const at = readout.smashed ?? aimed;
    const sound = result === "block" ? "shield" : "smash";
    const timers = [
      window.setTimeout(() => {
        play("attack");
        setShot({ at, result, key: Date.now() });
      }, 0),
      window.setTimeout(() => {
        play(sound);
        if (result === "break") play("shield");
        if (result !== "block") setQuake(true);
      }, FIRE_MS),
      window.setTimeout(() => setHeld(null), FIRE_MS + 220),
      window.setTimeout(() => setQuake(false), FIRE_MS + 520),
      window.setTimeout(onReturn, FIRE_MS + AFTER_MS + RETURN_MS),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
    // Only a new strike result should replay this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readout, onReturn]);

  function strike(target: number | null) {
    if (state.fightSettled) return;
    setAimed(target);
    setHeld(state.rivalLevels);
    onStrike(target);
  }

  const status = state.fightSettled && held !== null
    ? t("火龍噴火！")
    : state.fightSettled
    ? readout?.smashed != null
      ? t("{b}跌咗一級！", { b: t(LANDMARK_NAMES[readout.smashed]) })
      : readout?.hit
        ? t("打中！")
        : t("攻擊俾黑洞吸走咗！")
    : standing.length > 0
      ? `${state.enemyShield ? "🛡️ " : ""}${t("撳一座建築 🔨")}`
      : t("一座建築都冇，直接打！");

  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#0B1B3F] [container-type:size]"
      data-testid="search"
    >
      {/* The rival's town page in 3D: tap a building to strike it. */}
      <div className={cn("absolute inset-0", quake && "animate-[smash_0.5s_ease-out]")}>
        <CityView
          theme={state.rivalCity}
          levels={held ?? state.rivalLevels}
          targets={picking}
          onPick={(index) => {
            if (picking && standing.includes(index)) strike(index);
          }}
          fire={shot}
          fireKey={shot?.key ?? 0}
          attacker={state.pet ? { element: state.pet.element, stage: state.pet.stage, legend: holdsNft(state) } : null}
          resident={{
            // The rival's own monster (made up from who they are and how far along they are, for the practice board).
            element: state.rivalElement,
            stage: Math.min(4, 1 + state.rivalCity + Math.floor(totalLevels(state.rivalLevels) / 9)),
            legend: state.rivalHasNft && state.rivalNfts >= 3,
          }}
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
          {t(shownName)} · {t("第 {n} 頁", { n: state.rivalCity + 1 })}
        </p>
        <p
          className={cn(
            "mt-1 rounded-full px-2.5 py-0.5 text-xs font-black text-white shadow",
            edge > 0 ? "bg-[#16A34A]" : edge < 0 ? "bg-[#E52521]" : "bg-[#1E3A8A]/80",
          )}
          data-testid="match-up"
        >
          {t("佢係{e}龍", { e: t(ELEMENTS[state.rivalElement].name) })}
          {edge > 0 ? ` · ${t("你克佢！機會 +{n}%", { n: TYPE_EDGE })}` : edge < 0 ? ` · ${t("佢克你！機會 −{n}%", { n: TYPE_EDGE })}` : ""}
        </p>
      </header>

      {/* Bottom panel: what to do, what it paid, and the next action. */}
      <footer className="relative z-10 mt-auto space-y-2 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-3 shadow-[0_-6px_20px_rgba(30,58,138,0.25)]">
        <p className="text-center text-base font-black text-[#E52521]" data-testid="attack-status">
          {status}
        </p>
        {readout ? (
          <p className="flex items-center justify-center gap-2 text-sm font-bold text-[#1E3A8A]" data-testid="energy-pay">
            <span className="flex items-center gap-1">
              <img src={ENERGY_ICON} alt={t("能量")} className="size-5" />+{formatEnergy(coinEnergy(readout.pointsGained))}
            </span>
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

      {clouds ? (
        <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
          <CloudWall side="left" mode="out" delay={250} />
          <CloudWall side="right" mode="out" delay={250} />
        </div>
      ) : null}
    </main>
  );
}
