"use client";

import { BoardRing } from "@/components/board-ring";
import { DieFace } from "@/components/die-face";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LANDMARK_NAMES, TILES } from "@/lib/board";
import {
  STORAGE_KEY,
  countBuilt,
  createGame,
  parseSave,
  raiseTarget,
  reduce,
  type GameState,
  type Landmark,
} from "@/lib/game";
import { DICE_CAP, dayKeyOf, formatClock, msUntilNextDie, rollDie } from "@/lib/rules";
import { cn } from "cn";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

const STEP_MS = 420;

type PendingWalk = {
  face: number;
  from: number;
  step: number;
  enemyDice: [number, number] | null;
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
  if (landmark === "ruined") return "已損";
  return "未建";
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
                landmark === "ruined" && "border-[#6e332c] bg-[#f8e8e4]",
                landmark === "empty" && "border-dashed border-[#d7c4aa] bg-[#fffaf3]",
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
    const rivalDue =
      state.rivalDice < DICE_CAP && now - state.rivalLastRefillAt >= 30 * 60 * 1000;
    if (!playerDue && !rivalDue && key === state.dayKey) return;
    const id = window.setTimeout(() => {
      dispatch({ type: "tick", now, dayKey: key });
    }, 0);
    return () => window.clearTimeout(id);
  }, [booted, dispatch, now, state.dice, state.dayKey, state.lastRefillAt, state.rivalDice, state.rivalLastRefillAt]);

  useEffect(() => {
    if (!resetArmed) return;
    const id = window.setTimeout(() => setResetArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [resetArmed]);

  function rollPair(): [number, number] {
    return [rollDie(), rollDie()];
  }

  useEffect(() => {
    if (!pending?.running || pending.step >= pending.face) return;
    const id = window.setTimeout(() => {
      setPending((current) => {
        if (!current?.running || current.step >= current.face) return current;
        return { ...current, step: current.step + 1 };
      });
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [pending]);

  useEffect(() => {
    if (!pending?.running || pending.committed || pending.step < pending.face) return;
    const move = pending;
    const id = window.setTimeout(() => {
      setPending((current) => {
        if (!current?.running || current.committed) return current;
        return { ...current, running: false, committed: true };
      });
      dispatch({ type: "move", face: move.face, enemyDice: move.enemyDice, now: Date.now() });
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [pending, dispatch]);

  function onWalk() {
    if (state.phase !== "walk" || state.dice < 1 || pending?.running) return;
    const face = rollDie();
    const from = state.position;
    const nextIndex = (from + face) % TILES.length;
    const enemyDice = TILES[nextIndex]?.kind === "attack" ? rollPair() : null;
    setPending({ face, from, step: 0, enemyDice, running: true, committed: false });
  }

  function onBuild() {
    if (raiseTarget(state) === null) return;
    dispatch({ type: "build" });
  }

  function onWeapon() {
    if (state.phase !== "search" || state.fightSettled) return;
    dispatch({ type: "weapon" });
  }

  const weapon = countBuilt(state.landmarks);
  const rivalPower = countBuilt(state.rivalLandmarks);
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
  const bothNft = state.hasNft && state.rivalHasNft !== false;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <p className="text-sm font-medium tracking-[0.22em] text-[#9e3428]">每日棋盤</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight text-[#2a1c14]">
          {state.phase === "search" ? "搜尋敵人" : "大富翁"}
        </h1>
      </header>

      {saveNote ? (
        <p className="rounded-2xl border border-[#e0bf78] bg-[#fbf3df] px-4 py-3 text-sm text-[#6a4b12]" role="status">
          {saveNote}
        </p>
      ) : null}

      {state.phase === "search" ? (
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
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button className="h-10 cursor-pointer text-sm" variant="outline" onClick={onBuild} data-testid="raise">
              起地標
            </Button>
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
          {state.fightSettled ? null : (
            <Button
              className="mt-4 h-24 w-full cursor-pointer text-3xl font-bold"
              onClick={onWeapon}
              data-testid="weapon"
            >
              {readout?.shieldBreak ? "再攻擊" : "用武器攻擊"}
            </Button>
          )}
          <div className="mt-4">
            <NftToggles
              hasNft={state.hasNft}
              rivalHasNft={state.rivalHasNft !== false}
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
      ) : (
        <section className="space-y-4 rounded-3xl p-3" style={artBackground("board.jpg", 0.9)} data-testid="walk">
          <div
            className="flex h-28 items-end rounded-2xl p-4"
            style={artBackground("mission.jpg", 0.35)}
          >
            <p className="rounded-xl bg-[#fffaf3]/90 px-3 py-2 text-sm font-semibold text-[#2a1c14]">
              每日：自己走。四格攻擊，踩到就搜尋敵人。
            </p>
          </div>
          <NftToggles
            hasNft={state.hasNft}
            rivalHasNft={state.rivalHasNft !== false}
            onPlayer={(value) => dispatch({ type: "set-nft", value })}
            onRival={(value) => dispatch({ type: "set-rival-nft", value })}
          />
          <BoardRing
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
            <div className="flex items-center gap-4" data-testid="walk-result">
              <DieFace value={pending.face} />
              <p className="text-2xl font-bold text-[#2a1c14]" data-testid="last-walk">
                {arrived ? `行到第 ${shownStep} 格` : `擲出 ${pending.face}`}
              </p>
            </div>
          ) : null}
          <Button
            className="h-24 w-full cursor-pointer text-3xl font-bold"
            onClick={onWalk}
            data-testid="roll-move"
          >
            擲骰行棋
          </Button>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[#6f5b4b]">手上 {state.dice}／20 顆。</p>
            <Button
              className="h-10 cursor-pointer px-3 text-sm"
              variant="outline"
              onClick={() => dispatch({ type: "add-test-die" })}
              data-testid="test-die"
            >
              補一粒（測試）
            </Button>
          </div>
          {state.dice < 1 ? (
            <p className="text-sm leading-6 text-[#9e3428]" data-testid="need-two">
              擲骰行棋要 1 顆。
            </p>
          ) : (
            <p className="text-xs leading-5 text-[#6f5b4b]">
              每 30 分鐘補 1 顆。
              {countdown ? ` 下一顆 ${formatClock(countdown)}。` : null}
            </p>
          )}
        </section>
      )}

      <Button
        variant="ghost"
        className="h-10 cursor-pointer text-[#6f5b4b]"
        onClick={() => {
          if (!resetArmed) {
            setResetArmed(true);
            return;
          }
          const stamp = Date.now();
          dispatch({ type: "reset", now: stamp, dayKey: dayKeyOf(stamp) });
          setResetArmed(false);
          setSaveNote(null);
        }}
      >
        {resetArmed ? "確定重開這塊棋盤？" : "重開這塊棋盤"}
      </Button>
    </main>
  );
}
