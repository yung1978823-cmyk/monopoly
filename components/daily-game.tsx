"use client";

import { AttackScreen } from "@/components/attack-screen";
import { BoardRing } from "@/components/board-ring";
import { DieFace } from "@/components/die-face";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BOARD_SCENE, TILES, TILE_INFO } from "@/lib/board";
import { CITIES, plotCount } from "@/lib/cities";
import {
  STORAGE_KEY,
  builtIndexes,
  canBuild,
  countBuilt,
  createGame,
  nextBuildCost,
  parseSave,
  raiseTarget,
  reduce,
  type GameState,
} from "@/lib/game";
import { DAILY_DST_CAP, DICE_CAP, dayKeyOf, formatClock, msUntilNextDie, rollDie } from "@/lib/rules";
import { cn } from "cn";
import { useCallback, useEffect, useState } from "react";

const STEP_MS = 240;
/** How long the 🔨 swoop plays before the attack screen opens. */
const INTRO_MS = 1100;

type PendingWalk = {
  faces: [number, number];
  steps: number;
  from: number;
  step: number;
  enemyDice: [number, number] | null;
  rivalBuilt: number;
  rivalCity: number;
  chest: number;
  running: boolean;
  committed: boolean;
};

function NftToggles({
  hasNft,
  rivalHasNft,
  onPlayer,
  onRival,
}: {
  hasNft: boolean;
  rivalHasNft: boolean;
  onPlayer: (value: boolean) => void;
  onRival: (value: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="flex h-16 items-center justify-between rounded-2xl border-2 border-[#9e3428] bg-[#fffaf3] px-4">
        <span className="text-lg font-bold" id="nft-label">
          我有 NFT
        </span>
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#9e3428]">{hasNft ? "開" : "關"}</span>
          <Switch
            checked={hasNft}
            onCheckedChange={onPlayer}
            aria-labelledby="nft-label"
            data-testid="nft-switch"
          />
        </span>
      </label>
      <label className="flex h-16 items-center justify-between rounded-2xl border-2 border-[#9e3428] bg-[#fffaf3] px-4">
        <span className="text-lg font-bold" id="rival-nft-label">
          對手有 NFT
        </span>
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#9e3428]">{rivalHasNft ? "開" : "關"}</span>
          <Switch
            checked={rivalHasNft}
            onCheckedChange={onRival}
            aria-labelledby="rival-nft-label"
            data-testid="rival-nft-switch"
          />
        </span>
      </label>
    </div>
  );
}

/** The picture and number for what the last square did, e.g. 🪙 +2 or 🚔 −2. */
function LandingBadge({ landing }: { landing: NonNullable<GameState["landing"]> }) {
  const parts: string[] = [];
  if (landing.points !== 0) parts.push(`${landing.points > 0 ? "+" : "−"}${Math.abs(landing.points)}⭐`);
  if (landing.dice > 0) parts.push(`+${landing.dice}🎲`);
  const bad = landing.points < 0;
  return (
    <span
      className={cn(
        "flex animate-[pop_0.4s_ease-out] items-center gap-1 rounded-full border-2 border-[#FBD000] px-2.5 py-0.5 text-[clamp(12px,3.6vw,18px)] font-black tabular-nums text-white shadow-md",
        bad ? "bg-[#46506E]" : "bg-[#43B047]",
      )}
      data-testid="landing"
    >
      <span className="text-[1.3em] leading-none">{TILE_INFO[landing.kind].icon}</span>
      {parts.join(" ")}
    </span>
  );
}

export function DailyGame() {
  const [state, setState] = useState<GameState>(() => createGame(0, "1970-01-01"));
  const [booted, setBooted] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<PendingWalk | null>(null);
  /** The roll whose attack intro has already played. */
  const [introSeen, setIntroSeen] = useState(-1);
  const dispatch = useCallback((action: Parameters<typeof reduce>[1]) => {
    setState((current) => reduce(current, action));
  }, []);
  // Stable, so the attack screen's auto-return timer isn't restarted on every clock tick.
  const returnToBoard = useCallback(() => dispatch({ type: "return-walk" }), [dispatch]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stamp = Date.now();
      const key = dayKeyOf(stamp);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          dispatch({ type: "reset", now: stamp, dayKey: key });
        } else {
          const saved = parseSave(raw, stamp, key);
          if (!saved) {
            setSaveNote("存檔讀不出來，已改用一塊新棋盤。");
            dispatch({ type: "reset", now: stamp, dayKey: key });
          } else {
            dispatch({ type: "hydrate", state: saved, now: stamp, dayKey: key });
          }
        }
      } catch {
        setSaveNote("存檔讀不出來，已改用一塊新棋盤。");
        dispatch({ type: "reset", now: stamp, dayKey: key });
      }
      setBooted(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [dispatch]);

  useEffect(() => {
    if (!booted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, state }));
    } catch {
      const id = window.setTimeout(
        () => setSaveNote("這台瀏覽器沒把棋盤存下來。重新整理會回到新棋盤。"),
        0,
      );
      return () => window.clearTimeout(id);
    }
  }, [booted, state]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const kick = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!booted || now === 0) return;
    const key = dayKeyOf(now);
    const playerDue = state.dice < DICE_CAP && now - state.lastRefillAt >= 30 * 60 * 1000;
    if (!playerDue && key === state.dayKey) return;
    const id = window.setTimeout(() => {
      dispatch({ type: "tick", now, dayKey: key });
    }, 0);
    return () => window.clearTimeout(id);
  }, [booted, dispatch, now, state.dice, state.dayKey, state.lastRefillAt]);

  useEffect(() => {
    if (!resetArmed) return;
    const id = window.setTimeout(() => setResetArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [resetArmed]);

  // Landing on 攻擊 plays a short 🔨 swoop over the board, then opens the rival's city.
  useEffect(() => {
    if (state.phase !== "search" || introSeen === state.rollCount) return;
    const roll = state.rollCount;
    const id = window.setTimeout(() => setIntroSeen(roll), INTRO_MS);
    return () => window.clearTimeout(id);
  }, [state.phase, state.rollCount, introSeen]);

  function rollPair(): [number, number] {
    return [rollDie(), rollDie()];
  }

  useEffect(() => {
    if (!pending?.running || pending.step >= pending.steps) return;
    const id = window.setTimeout(() => {
      setPending((current) => {
        if (!current?.running || current.step >= current.steps) return current;
        return { ...current, step: current.step + 1 };
      });
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [pending]);

  useEffect(() => {
    if (!pending?.running || pending.committed || pending.step < pending.steps) return;
    const move = pending;
    const id = window.setTimeout(() => {
      setPending((current) => {
        if (!current?.running || current.committed) return current;
        return { ...current, running: false, committed: true };
      });
      dispatch({
        type: "move",
        faces: move.faces,
        enemyDice: move.enemyDice,
        rivalBuilt: move.rivalBuilt,
        rivalCity: move.rivalCity,
        chest: move.chest,
        now: Date.now(),
      });
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [pending, dispatch]);

  function onWalk() {
    if (state.phase !== "walk" || state.dice < 1 || pending?.running) return;
    const faces = rollPair();
    const steps = faces[0] + faces[1];
    const from = state.position;
    const nextIndex = (from + steps) % TILES.length;
    const enemyDice = TILES[nextIndex]?.kind === "attack" ? rollPair() : null;
    // Each 攻擊 square meets a rival in a random city, with 0 up to that city's plots built.
    const rivalCity = Math.floor(Math.random() * CITIES.length);
    const rivalBuilt = Math.floor(Math.random() * (plotCount(rivalCity) + 1));
    const chest = 3 + Math.floor(Math.random() * 4);
    setPending({ faces, steps, from, step: 0, enemyDice, rivalBuilt, rivalCity, chest, running: true, committed: false });
  }

  function onBuild() {
    if (!canBuild(state)) return;
    dispatch({ type: "build" });
  }

  function onWeapon(target: number | null = null) {
    if (state.phase !== "search" || state.fightSettled) return;
    dispatch({ type: "weapon", target });
  }

  /** Test helper: the rival hits one of your standing landmarks. */
  function onRaided() {
    const standing = builtIndexes(state.landmarks);
    if (standing.length === 0) return;
    dispatch({ type: "raided", target: standing[Math.floor(Math.random() * standing.length)] });
  }

  const weapon = countBuilt(state.landmarks);
  const landing = state.landing;
  const shownStep = pending?.step ?? 0;
  const tokenIndex = pending ? (pending.from + shownStep) % TILES.length : state.position;
  const trail = pending
    ? Array.from({ length: shownStep }, (_, index) => (pending.from + index + 1) % TILES.length)
    : [];
  const arrived = pending !== null && shownStep > 0;
  const countdown = booted && now > 0 ? msUntilNextDie(state.dice, state.lastRefillAt, now) : null;
  const buildCost = nextBuildCost(state);
  const buildable = canBuild(state);
  const buildSlot = raiseTarget(state);
  const repairing = buildSlot !== null && state.landmarks[buildSlot] === "ruined";

  const resetBoard = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    const stamp = Date.now();
    dispatch({ type: "reset", now: stamp, dayKey: dayKeyOf(stamp) });
    setResetArmed(false);
    setSaveNote(null);
    setMenuOpen(false);
  };

  const intro = state.phase === "search" && introSeen !== state.rollCount;

  if (state.phase === "search" && !intro) {
    return (
      <AttackScreen
        state={state}
        onStrike={(target) => onWeapon(target)}
        onReturn={returnToBoard}
      />
    );
  }

  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#4AA8F5] via-[#8CC63F] to-[#7DB835] text-[#1E3A8A] [container-type:size]"
      data-testid="walk"
    >
      {/* Castle-garden scene, fitted to the screen width, with the board on its lawn. */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[54%] bg-cover bg-center"
        style={{
          backgroundImage: `url(${BOARD_SCENE.art})`,
          width: `min(100cqw, calc(100cqh * ${BOARD_SCENE.width} / ${BOARD_SCENE.height}))`,
          aspectRatio: `${BOARD_SCENE.width} / ${BOARD_SCENE.height}`,
        }}
      >
        <div
          className="absolute"
          style={{
            left: `${BOARD_SCENE.board.left * 100}%`,
            top: `${BOARD_SCENE.board.top * 100}%`,
            width: `${BOARD_SCENE.board.width * 100}%`,
          }}
        >
          <BoardRing
            position={tokenIndex}
            trail={trail}
            stopIndex={arrived ? tokenIndex : null}
            centre={
              pending ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1">
                    <DieFace value={pending.faces[0]} />
                    <DieFace value={pending.faces[1]} />
                  </div>
                  {pending.committed && landing ? <LandingBadge landing={landing} /> : null}
                </div>
              ) : null
            }
          />
        </div>
      </div>
      {/* Top bar: dice and points only; everything else lives behind the menu. */}
      <header className="relative z-30 flex items-center justify-between gap-2 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex items-center gap-1.5 rounded-full border-2 border-[#FBD000] bg-[#1E3A8A] py-1 pl-2 pr-3 text-lg font-black tabular-nums text-white shadow-md" data-testid="dice-count">
          🎲 {state.dice}
        </div>
        <div className="flex items-center gap-1.5 rounded-full border-2 border-[#FBD000] bg-white py-1 pl-2 pr-3 text-lg font-black tabular-nums text-[#1E3A8A] shadow-md" data-testid="hud-points">
          ⭐ {state.points}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#E52521] text-xl text-white shadow-md"
          aria-label="設定"
          data-testid="menu"
        >
          ☰
        </button>
      </header>

      {saveNote ? (
        <p className="relative z-30 mx-3 rounded-2xl bg-[#FFFFFF] px-4 py-2 text-xs text-[#1E3A8A]" role="status">
          {saveNote}
        </p>
      ) : null}

      <section className="relative z-20 min-h-0 flex-1" />

      {/* Bottom bar: one big GO; building sits to the side as an icon. */}
      <footer className="relative z-30 flex items-end justify-center px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
        <button
          type="button"
          onClick={onBuild}
          disabled={!buildable || pending?.running === true}
          className="absolute bottom-[max(env(safe-area-inset-bottom),1rem)] left-5 flex cursor-pointer flex-col items-center disabled:cursor-default disabled:opacity-50"
          aria-label={buildCost === null ? "地標已建齊" : `${repairing ? "修理" : "起地標"}，要 ${buildCost} 分`}
          data-testid="raise"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl border-[3px] border-[#FBD000] bg-[#43B047] text-3xl shadow-[0_4px_0_#2E8B3E]">
            {repairing ? "🔧" : "🏗️"}
          </span>
          {buildCost === null ? null : (
            <span className="-mt-2 rounded-full bg-white px-2 text-xs font-black tabular-nums text-[#1E3A8A] shadow">
              ⭐{buildCost}
            </span>
          )}
        </button>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onWalk}
            disabled={state.dice < 1 || pending?.running === true}
            className="flex size-28 cursor-pointer items-center justify-center rounded-full border-[6px] border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-5xl font-black tracking-wide text-white shadow-[0_8px_0_#8E1210,0_14px_24px_rgba(30,58,138,0.45)] transition-transform active:translate-y-1.5 active:shadow-[0_2px_0_#8E1210] disabled:cursor-default disabled:opacity-60"
            aria-label="擲骰"
            data-testid="roll-move"
          >
            GO
          </button>
          <span className="h-5 rounded-full bg-white/85 px-2 text-xs font-bold tabular-nums text-[#1E3A8A]" data-testid="need-two">
            {countdown ? `🎲+1 ⏱ ${formatClock(countdown)}` : null}
          </span>
        </div>
      </footer>

      {intro ? (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle,rgba(229,37,33,0.55)_0%,rgba(142,18,16,0.85)_75%)] animate-[pop_0.3s_ease-out]"
          data-testid="attack-intro"
        >
          <span className="relative text-[min(38cqw,11rem)] leading-none drop-shadow-[0_10px_16px_rgba(0,0,0,0.45)]">
            <span className="block animate-[hammer_0.6s_ease-out]">🔨</span>
            <span className="absolute -bottom-4 -right-6 text-[0.5em] animate-[pop_0.4s_ease-out_0.45s_both]">💥</span>
          </span>
        </div>
      ) : null}

      {/* Settings sheet. */}
      {menuOpen ? (
        <div className="absolute inset-0 z-40 flex items-end bg-[#1E3A8A]/60" onClick={() => setMenuOpen(false)}>
          <div
            className="w-full space-y-3 rounded-t-[32px] bg-[#FFFFFF] p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            data-testid="menu-sheet"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">設定</h2>
              <button type="button" className="cursor-pointer text-2xl" onClick={() => setMenuOpen(false)} aria-label="關閉">
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-bold text-[#1E3A8A]">
              <span className="rounded-full bg-[#EAF4FF] px-3 py-1">⚔️ 武器 {weapon}／4</span>
              {state.hasNft ? (
                <span className="rounded-full bg-[#E8F7E8] px-3 py-1 text-[#2E8B3E]" data-testid="dst-today">
                  DST {state.dstTakenToday}／{DAILY_DST_CAP}
                </span>
              ) : null}
            </div>
            <NftToggles
              hasNft={state.hasNft}
              rivalHasNft={state.rivalHasNft}
              onPlayer={(value) => dispatch({ type: "set-nft", value })}
              onRival={(value) => dispatch({ type: "set-rival-nft", value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-11 cursor-pointer"
                variant="outline"
                onClick={() => dispatch({ type: "add-test-die" })}
                data-testid="test-die"
              >
                補一粒（測試）
              </Button>
              <Button
                className="h-11 cursor-pointer"
                variant="outline"
                onClick={onRaided}
                disabled={weapon === 0}
                data-testid="raided"
              >
                被攻擊（測試）
              </Button>
              <Button className="h-11 cursor-pointer" variant="outline" onClick={resetBoard}>
                {resetArmed ? "確定重開？" : "重開棋盤"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
