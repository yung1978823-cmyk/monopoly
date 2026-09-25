"use client";

import { BoardRing } from "@/components/board-ring";
import { DieFace } from "@/components/die-face";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LANDMARK_NAMES, TILES } from "@/lib/board";
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
  type Landmark,
} from "@/lib/game";
import { DAILY_DST_CAP, DICE_CAP, dayKeyOf, formatClock, msUntilNextDie, rollDie } from "@/lib/rules";
import { cn } from "cn";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

const STEP_MS = 240;

type PendingWalk = {
  faces: [number, number];
  steps: number;
  from: number;
  step: number;
  enemyDice: [number, number] | null;
  rivalBuilt: number;
  running: boolean;
  committed: boolean;
};

function artBackground(file: string, wash: number): CSSProperties {
  return {
    backgroundImage: `linear-gradient(rgba(255,250,243,${wash}), rgba(255,247,238,${wash})), url(/art/${file})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

function landmarkLabel(landmark: Landmark): string {
  if (landmark === "built") return "已建成";
  if (landmark === "ruined") return "已打爛";
  return "未建";
}

function BuildButton({
  cost,
  enabled,
  points,
  onBuild,
  className,
}: {
  cost: number | null;
  enabled: boolean;
  points: number;
  onBuild: () => void;
  className?: string;
}) {
  const label =
    cost === null ? "四座地標已建成" : enabled ? `起地標（花 ${cost} 分）` : `起地標要 ${cost} 分（差 ${cost - points}）`;
  return (
    <Button
      className={cn("h-12 cursor-pointer text-base", className)}
      variant="outline"
      onClick={onBuild}
      disabled={!enabled}
      data-testid="raise"
    >
      {label}
    </Button>
  );
}

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

function LandmarkStrip({
  title,
  landmarks,
}: {
  title: string;
  landmarks: Landmark[];
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ul className="grid grid-cols-4 gap-2">
        {LANDMARK_NAMES.map((name, index) => {
          const landmark = landmarks[index];
          return (
            <li
              key={name}
              className={cn(
                "rounded-xl border px-1 py-2 text-center",
                landmark === "built" && "border-[#1f6b4a] bg-[#e7f5ee]",
                landmark === "empty" && "border-dashed border-[#d7c4aa] bg-[#fffaf3]",
                landmark === "ruined" && "border-[#6e332c] bg-[#e9d3cc] line-through",
              )}
            >
              <span className="block text-sm font-semibold">{name}</span>
              <span className="text-[11px] text-[#6f5b4b]">{landmarkLabel(landmark)}</span>
            </li>
          );
        })}
      </ul>
    </div>
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
  const dispatch = useCallback((action: Parameters<typeof reduce>[1]) => {
    setState((current) => reduce(current, action));
  }, []);

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
    // Each 攻擊 square meets a rival with 0–4 landmarks standing.
    const rivalBuilt = Math.floor(Math.random() * 5);
    setPending({ faces, steps, from, step: 0, enemyDice, rivalBuilt, running: true, committed: false });
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
  const rivalPower = countBuilt(state.rivalLandmarks);
  const rivalStanding = builtIndexes(state.rivalLandmarks);
  const attackTotal = 10 + weapon * 5;
  const defenseTotal = rivalPower * 5 + (state.enemyLuck ?? 0);
  const shownStep = pending?.step ?? 0;
  const tokenIndex = pending ? (pending.from + shownStep) % TILES.length : state.position;
  const trail = pending
    ? Array.from({ length: shownStep }, (_, index) => (pending.from + index + 1) % TILES.length)
    : [];
  const here = TILES[tokenIndex]?.name ?? "起點";
  const arrived = pending !== null && shownStep > 0;
  const countdown = booted && now > 0 ? msUntilNextDie(state.dice, state.lastRefillAt, now) : null;
  const readout = state.weaponReadout;
  const bothNft = state.hasNft && state.rivalHasNft;
  const buildCost = nextBuildCost(state);
  const buildable = canBuild(state);
  const buildSlot = raiseTarget(state);
  const repairing = buildSlot !== null && state.landmarks[buildSlot] === "ruined";
  const dstLabel = `今日 DST ${state.dstTakenToday}／${DAILY_DST_CAP}`;

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

  if (state.phase === "search") {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-y-auto bg-[#411314] px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <h1 className="mb-3 text-center text-3xl font-black text-[#fee0ba]">搜尋敵人</h1>
        <section
          className="rounded-3xl border-2 border-[#9e3428] bg-[#fffaf3] p-4"
          style={artBackground("enemy-city.jpg", 0.86)}
          data-testid="search"
        >
          <p className="text-sm leading-6 text-[#6f5b4b]">配到街坊阿強。不用你選。</p>
          <div className="mt-4">
            <LandmarkStrip title="阿強的四座建築" landmarks={state.rivalLandmarks} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[#6f5b4b]">幸運值</p>
              <p className="text-4xl font-bold tabular-nums text-[#2a1c14]" data-testid="enemy-luck">
                {state.enemyLuck ?? "–"}
              </p>
              <p className="mt-1 text-sm text-[#6f5b4b]">建築 {rivalPower}／4</p>
            </div>
            <div className="flex gap-2">
              <DieFace value={state.lastRivalFaces?.[0] ?? null} />
              <DieFace value={state.lastRivalFaces?.[1] ?? null} />
            </div>
          </div>
          <div
            className="mt-4 overflow-hidden rounded-2xl border border-[#e0bf78] p-4"
            style={artBackground(state.enemyShield ? "shield.jpg" : "attack.jpg", 0.72)}
            data-testid={state.enemyShield ? "shield" : "attack-art"}
          >
            <p className="text-sm text-[#6f5b4b]">{state.enemyShield ? "敵人有一面盾" : "盾已經破了"}</p>
            <p className="mt-1 text-sm leading-6">
              總攻擊 <span className="text-2xl font-bold tabular-nums">{attackTotal}</span>
              <span className="text-[#6f5b4b]">（10＋武器 {weapon}×5）</span>
            </p>
            <p className="text-sm leading-6">
              總防守 <span className="text-2xl font-bold tabular-nums">{defenseTotal}</span>
              <span className="text-[#6f5b4b]">（建築 {rivalPower}×5＋幸運值 {state.enemyLuck ?? "–"}）</span>
            </p>
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums" data-testid="fight-points">
            分數 {state.points}
          </p>
          <p className="text-sm font-semibold text-[#1f6b4a]" data-testid="dst-today">
            {dstLabel}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <BuildButton cost={buildCost} enabled={buildable} points={state.points} onBuild={onBuild} />
            <p className="self-center text-xs leading-5 text-[#6f5b4b]" data-testid="dst-still">
              {bothNft
                ? "兩邊都有 NFT。盾破只得 1 分、0 DST。沒有盾才搬 DST，一日最多 5。"
                : "有一邊沒有 NFT。只計分數，DST 0。"}
            </p>
          </div>
          {readout ? (
            <div className="mt-4 rounded-2xl bg-[#f6efe4] px-4 py-3" data-testid="verdict">
              <p className="text-sm text-[#6f5b4b]">
                總攻擊 {readout.attackTotal} · 總防守 {readout.defenseTotal}
              </p>
              <p className="mt-1 text-3xl font-bold text-[#9e3428]">
                {readout.shieldBreak ? "盾破" : readout.hit ? "打中" : "打唔中"}
              </p>
              <p className="mt-1 text-sm leading-6" data-testid="dst-pay">
                得 {readout.pointsGained} 分。
                {readout.dst > 0 ? `搬走 ${readout.dst} DST。` : "DST 0。"}
              </p>
            </div>
          ) : null}
          {readout?.smashed != null ? (
            <p className="mt-3 rounded-2xl bg-[#411314] px-4 py-3 text-center text-xl font-black text-[#fee0ba]" data-testid="smashed">
              💥 打爛咗阿強嘅{LANDMARK_NAMES[readout.smashed]}！
            </p>
          ) : null}
          {state.fightSettled ? null : state.enemyShield || rivalStanding.length === 0 ? (
            <Button
              className="mt-4 h-24 w-full cursor-pointer text-3xl font-bold"
              onClick={() => onWeapon(null)}
              data-testid="weapon"
            >
              {readout?.shieldBreak ? "再攻擊" : "用武器攻擊"}
            </Button>
          ) : (
            <div className="mt-4" data-testid="pick-target">
              <p className="mb-2 text-center text-sm font-bold text-[#411314]">盾已經破咗，揀一座建築打落去：</p>
              <div className="grid grid-cols-2 gap-2">
                {rivalStanding.map((index) => (
                  <Button
                    key={index}
                    className="h-16 cursor-pointer text-xl font-black"
                    onClick={() => onWeapon(index)}
                    data-testid={`target-${index}`}
                  >
                    🔨 {LANDMARK_NAMES[index]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4">
            <NftToggles
              hasNft={state.hasNft}
              rivalHasNft={state.rivalHasNft}
              onPlayer={(value) => dispatch({ type: "set-nft", value })}
              onRival={(value) => dispatch({ type: "set-rival-nft", value })}
            />
          </div>
          {readout ? (
            <Button
              className="mt-4 h-10 w-full cursor-pointer"
              variant="outline"
              onClick={() => dispatch({ type: "return-walk" })}
            >
              返回棋盤
            </Button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#fdb7b8] text-[#411314]"
      data-testid="walk"
    >
      {/* Top bar: points, dice, today's DST, menu. */}
      <header className="z-30 flex items-center gap-2 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[#f2b53a] bg-[#411314] text-lg font-black text-[#fee0ba] shadow-md">
          你
        </div>
        <div className="flex flex-1 items-center justify-between rounded-full border-2 border-[#f2b53a] bg-[#fee0ba] px-3 py-1.5 shadow-md">
          <span className="text-sm font-black tabular-nums" data-testid="hud-points">
            ⭐ {state.points}
          </span>
          <span className="text-sm font-bold tabular-nums text-[#2f7a50]" data-testid="dst-today">
            DST {state.dstTakenToday}／{DAILY_DST_CAP}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-[#f2b53a] bg-[#c73331] text-xl text-[#fee0ba] shadow-md"
          aria-label="設定"
          data-testid="menu"
        >
          ☰
        </button>
      </header>

      {saveNote ? (
        <p className="mx-3 rounded-2xl bg-[#fee0ba] px-4 py-2 text-xs text-[#411314]" role="status">
          {saveNote}
        </p>
      ) : null}

      {/* The board fills the middle of the screen. */}
      <section className="relative flex min-h-0 flex-1 items-center justify-center [container-type:size]">
        <BoardRing
          className="w-[min(100cqw,100cqh)]"
          position={tokenIndex}
          landmarks={state.landmarks}
          points={state.points}
          defense={weapon}
          purseLabel={state.hasNft ? "有 NFT" : "沒有 NFT"}
          placeLabel={arrived ? `行到第 ${shownStep} 格` : `停在${here}`}
          trail={trail}
          stopIndex={arrived ? tokenIndex : null}
        />
        {pending ? (
          <div
            className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#411314]/85 px-4 py-2 shadow-lg"
            data-testid="walk-result"
          >
            <DieFace value={pending.faces[0]} />
            <DieFace value={pending.faces[1]} />
            <p className="text-xl font-black text-[#fee0ba]" data-testid="last-walk">
              {arrived ? `${shownStep}／${pending.steps}` : `擲出 ${pending.steps}`}
            </p>
          </div>
        ) : null}
      </section>

      {/* Bottom bar: build on the left, the big roll button in the middle. */}
      <footer className="relative z-30 flex items-end justify-between gap-3 rounded-t-[32px] bg-[#fee0ba] px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-6px_20px_rgba(65,19,20,0.25)]">
        <button
          type="button"
          onClick={onBuild}
          disabled={!buildable || pending?.running === true}
          className="flex w-20 cursor-pointer flex-col items-center gap-1 text-xs font-bold disabled:cursor-default disabled:opacity-50"
          data-testid="raise"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl border-2 border-[#f2b53a] bg-[#2fa66a] text-2xl shadow-md">
            🏗️
          </span>
          {buildCost === null
            ? "已建齊"
            : `${repairing ? "修理" : "起地標"} ${buildCost}`}
        </button>

        <div className="-mt-12 flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onWalk}
            disabled={state.dice < 1 || pending?.running === true}
            className="flex size-28 cursor-pointer flex-col items-center justify-center rounded-[36px] border-[5px] border-[#f2b53a] bg-gradient-to-b from-[#e0453f] to-[#a82524] text-[#fee0ba] shadow-[0_8px_0_#6b1a1b,0_14px_24px_rgba(65,19,20,0.45)] transition-transform active:translate-y-1.5 active:shadow-[0_2px_0_#6b1a1b] disabled:cursor-default disabled:opacity-60"
            data-testid="roll-move"
          >
            <span className="text-4xl font-black leading-none tracking-wide">GO</span>
            <span className="mt-1 text-xs font-bold">擲骰行棋</span>
          </button>
          <span className="rounded-full bg-[#411314] px-4 py-0.5 text-sm font-black tabular-nums text-[#fee0ba]" data-testid="dice-count">
            🎲 {state.dice}／{DICE_CAP}
          </span>
          <span className="h-4 text-[10px] font-semibold text-[#8a4a3c]" data-testid="need-two">
            {state.dice < 1
              ? "擲骰行棋要 1 顆"
              : countdown
                ? `下一顆 ${formatClock(countdown)}`
                : null}
          </span>
        </div>

        <div className="flex w-20 flex-col items-center gap-1 text-xs font-bold">
          <span className="flex size-12 items-center justify-center rounded-2xl border-2 border-[#f2b53a] bg-[#c73331] text-2xl text-[#fee0ba] shadow-md">
            ⚔️
          </span>
          武器 {weapon}／4
        </div>
      </footer>

      {/* Settings sheet. */}
      {menuOpen ? (
        <div className="absolute inset-0 z-40 flex items-end bg-[#411314]/60" onClick={() => setMenuOpen(false)}>
          <div
            className="w-full space-y-3 rounded-t-[32px] bg-[#fee0ba] p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            data-testid="menu-sheet"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">設定</h2>
              <button type="button" className="cursor-pointer text-2xl" onClick={() => setMenuOpen(false)} aria-label="關閉">
                ✕
              </button>
            </div>
            <p className="text-xs leading-5 text-[#8a4a3c]">
              擲兩粒骰行棋，只扣 1 顆。七格攻擊，踩中就搜尋敵人。起地標要用分數。
            </p>
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
