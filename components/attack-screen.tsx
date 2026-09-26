"use client";

import { DieFace } from "@/components/die-face";
import { TipHand } from "@/components/tip-hand";
import { LANDMARK_NAMES } from "@/lib/board";
import { CITIES, SHIELD_ART } from "@/lib/cities";
import { attackPower, builtIndexes, countBuilt, type GameState } from "@/lib/game";
import { cn } from "cn";
import { useEffect, useState } from "react";

type Flash = { kind: "shield" | "smash" | "hit" | "miss"; key: number };

const FLASH_MS = 1500;
const SHIELD_MS = 1200;
/** Pause after the last pop-up before heading back to the board on its own. */
const RETURN_MS = 700;

/**
 * The rival's city: their landmarks drawn on the city art. One tap on a building settles the
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
  const standing = builtIndexes(state.rivalLandmarks);
  const rivalPower = countBuilt(state.rivalLandmarks);
  // Show the totals the last strike used; a smash lowers the rival's defence afterwards.
  const attackTotal = readout?.attackTotal ?? attackPower(state);
  const defenseTotal = readout?.defenseTotal ?? rivalPower * 5 + (state.enemyLuck ?? 0);
  const picking = !state.fightSettled && standing.length > 0;
  const [flash, setFlash] = useState<Flash | null>(null);
  const [aimed, setAimed] = useState<number | null>(null);

  // Play the result once: the shield pop-up first if it broke, then the smash, hit or miss,
  // and then head back to the board by itself.
  useEffect(() => {
    if (!readout) return;
    const kind: Flash["kind"] = readout.smashed !== null ? "smash" : readout.hit ? "hit" : "miss";
    const lead = readout.shieldBreak ? SHIELD_MS : 0;
    const timers = [
      readout.shieldBreak ? window.setTimeout(() => setFlash({ kind: "shield", key: Date.now() }), 0) : 0,
      window.setTimeout(() => setFlash({ kind, key: Date.now() + 1 }), lead),
      window.setTimeout(() => setFlash(null), lead + FLASH_MS),
      window.setTimeout(onReturn, lead + FLASH_MS + RETURN_MS),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [readout, onReturn]);

  function strike(target: number | null) {
    if (state.fightSettled) return;
    setAimed(target);
    onStrike(target);
  }

  const status = state.fightSettled
    ? readout?.smashed != null
      ? `打爛咗${LANDMARK_NAMES[readout.smashed]}！`
      : readout?.hit
        ? "打中！"
        : "打唔中……"
    : standing.length > 0
      ? `${state.enemyShield ? "🛡️ " : ""}撳一座建築 🔨`
      : "一座建築都冇，直接打！";

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
          const landmark = state.rivalLandmarks[index];
          const smashedNow = flash?.kind === "smash" && readout?.smashed === index;
          const place = { left: `${spot.x * 100}%`, top: `${spot.y * 100}%` };
          if (landmark === "empty") {
            return (
              <span
                key={index}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-[#1E3A8A]"
                style={place}
              >
                未起
              </span>
            );
          }
          if (landmark === "ruined") {
            return (
              <span
                key={index}
                className={cn(
                  "absolute flex -translate-x-1/2 -translate-y-[70%] flex-col items-center text-[min(11cqw,3rem)] leading-none",
                  smashedNow && "animate-[smash_0.5s_ease-out]",
                )}
                style={place}
                data-testid={`ruined-${index}`}
              >
                💥
                <span className="mt-0.5 rounded-full bg-[#5b4a42]/80 px-2 text-[10px] font-bold text-white">已打爛</span>
              </span>
            );
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
              aria-label={`攻擊${LANDMARK_NAMES[index]}`}
              data-testid={`target-${index}`}
            >
              {/* Stand-in building until the 3D renders land. */}
              <span className="text-[min(13cqw,3.6rem)] leading-none drop-shadow-[0_6px_6px_rgba(0,0,0,0.3)]">
                {city.building}
              </span>
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

      {/* Rival banner. */}
      <header className="relative z-10 mx-3 mt-[max(env(safe-area-inset-top),0.75rem)] flex items-center gap-3 rounded-full border-[3px] border-[#FBD000] bg-white/95 py-1.5 pl-1.5 pr-4 shadow-lg">
        <span className="flex size-12 items-center justify-center rounded-full bg-[#E52521] text-2xl">💪</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black text-[#1E3A8A]">阿強嘅{city.name}</p>
          <p className="text-xs font-bold text-[#3B5BA9]">
            {state.rivalHasNft ? "🛡️ 有 NFT" : "冇 NFT"} · 建築 {rivalPower}／{city.plots.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <DieFace value={state.lastRivalFaces?.[0] ?? null} />
          <DieFace value={state.lastRivalFaces?.[1] ?? null} />
        </div>
      </header>

      {/* Bottom panel: totals, status and the next action. */}
      <footer className="relative z-10 mt-auto space-y-2 rounded-t-[32px] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-3 shadow-[0_-6px_20px_rgba(30,58,138,0.25)]">
        <div className="flex items-center justify-between text-sm font-bold text-[#1E3A8A]">
          <span>
            ⚔️ 攻擊 <span className="text-xl tabular-nums">{attackTotal}</span>
          </span>
          <span className="text-[#3B5BA9]">對</span>
          <span>
            🛡️ 防守 <span className="text-xl tabular-nums">{defenseTotal}</span>
          </span>
        </div>
        <p className="text-center text-base font-black text-[#E52521]" data-testid="attack-status">
          {status}
        </p>
        {readout ? (
          <p className="text-center text-sm font-bold text-[#1E3A8A]" data-testid="dst-pay">
            得 {readout.pointsGained} 分 · {readout.dst > 0 ? `搬走 ${readout.dst} DST` : "DST 0"} · 今日 DST{" "}
            {state.dstTakenToday}／5
          </p>
        ) : null}
        {state.fightSettled ? (
          <button
            type="button"
            onClick={onReturn}
            className="h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#049CD8] text-xl font-black text-white shadow-[0_5px_0_#1E3A8A] active:translate-y-1 active:shadow-[0_1px_0_#1E3A8A]"
            data-testid="return-walk"
          >
            返回棋盤
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
              🔨 攻擊
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
            <div
              className="flex aspect-square w-[88%] animate-[pop_0.45s_ease-out] items-end justify-center overflow-hidden rounded-[36px] border-4 border-[#FBD000] bg-cover bg-center shadow-2xl"
              style={{ backgroundImage: `url(${SHIELD_ART})` }}
            >
              <p className="mb-4 rounded-full bg-white/95 px-5 py-2 text-xl font-black text-[#E52521]">
                🛡️ 盾破！+1
              </p>
            </div>
          ) : (
            <p
              className={cn(
                "animate-[pop_0.45s_ease-out] rounded-3xl border-4 border-[#FBD000] px-8 py-4 text-4xl font-black text-white shadow-2xl",
                flash.kind === "miss" ? "bg-[#3B5BA9]" : "bg-[#E52521]",
              )}
            >
              {flash.kind === "smash"
                ? "💥 打爛咗！"
                : flash.kind === "hit"
                  ? "打中！"
                  : state.enemyShield
                    ? "🛡️ 擋住！"
                    : "打唔中"}
            </p>
          )}
        </div>
      ) : null}
    </main>
  );
}
