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
  remainingPurse,
  type GameState,
  type Landmark,
} from "@/lib/game";
import { DICE_CAP, PURSE_MAX, dayKeyOf, formatClock, msUntilNextDie, rollDie } from "@/lib/rules";
import { cn } from "cn";
import { useCallback, useEffect, useState } from "react";

function landmarkLabel(landmark: Landmark): string {
  if (landmark === "built") return "已建成";
  if (landmark === "ruined") return "已損";
  return "未建";
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

  function onWalk() {
    if (state.phase !== "walk" || state.dice < 2) return;
    const dice = rollPair();
    const nextIndex = (state.position + dice[0] + dice[1]) % TILES.length;
    const enemyDice = TILES[nextIndex]?.kind === "attack" ? rollPair() : null;
    dispatch({ type: "move", dice, enemyDice, now: Date.now() });
  }

  function onBuild() {
    if (raiseTarget(state) === null) return;
    dispatch({ type: "build" });
  }

  function onWeapon() {
    if (state.phase !== "search" || state.weaponReadout) return;
    dispatch({ type: "weapon" });
  }

  const weapon = countBuilt(state.landmarks);
  const rivalPower = countBuilt(state.rivalLandmarks);
  const here = TILES[state.position]?.name ?? "起點";
  const countdown = booted && now > 0 ? msUntilNextDie(state.dice, state.lastRefillAt, now) : null;
  const rivalPurse = remainingPurse(state.hasNft, PURSE_MAX, state.rivalStolenToday);
  const readout = state.weaponReadout;

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
        <section className="rounded-3xl border-2 border-[#9e3428] bg-[#fffaf3] p-4" data-testid="search">
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
              <p className="mt-1 text-sm text-[#6f5b4b]">戰鬥力 {rivalPower}／4</p>
            </div>
            <div className="flex gap-2">
              <DieFace value={state.lastRivalFaces?.[0] ?? null} />
              <DieFace value={state.lastRivalFaces?.[1] ?? null} />
            </div>
          </div>
          <p className="mt-4 text-sm leading-6">
            你的武器 <span className="text-2xl font-bold tabular-nums">{weapon}</span>／4
            <span className="text-[#6f5b4b]">。武器是你已建成的地標。</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button className="h-10 cursor-pointer text-sm" variant="outline" onClick={onBuild} data-testid="raise">
              起地標
            </Button>
            <p className="self-center text-xs leading-5 text-[#6f5b4b]">
              {state.hasNft ? `阿強錢包剩 ${rivalPurse} DST。一日最多 5。` : "沒有 NFT，打中也不拿 DST。"}
            </p>
          </div>
          {readout ? (
            <div className="mt-4 rounded-2xl bg-[#f6efe4] px-4 py-3" data-testid="verdict">
              <p className="text-sm text-[#6f5b4b]">
                武器 {readout.weapon} · 敵人 {readout.rivalTotal}
              </p>
              <p className="mt-1 text-3xl font-bold text-[#9e3428]">{readout.hit ? "打中" : "打唔中"}</p>
              <p className="mt-1 text-sm leading-6">
                {readout.hit ? "砸了一座建築。" : "沒有損傷。"}
                拿走 {readout.dst} DST。
              </p>
            </div>
          ) : (
            <Button
              className="mt-4 h-24 w-full cursor-pointer text-3xl font-bold"
              onClick={onWeapon}
              data-testid="weapon"
            >
              用武器攻擊
            </Button>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium" id="nft-label">
                我有 NFT
              </p>
            </div>
            <Switch
              checked={state.hasNft}
              onCheckedChange={(checked) => dispatch({ type: "set-nft", value: checked })}
              aria-labelledby="nft-label"
              data-testid="nft-switch"
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
        <section className="space-y-4" data-testid="walk">
          <p className="text-sm leading-6 text-[#6f5b4b]">
            自己一個人走。多數格子只加分數。踩到標著攻擊的那一格，才搜尋敵人。
          </p>
          <BoardRing
            position={state.position}
            landmarks={state.landmarks}
            points={state.points}
            defense={weapon}
            purseLabel={state.hasNft ? "有 NFT" : "沒有 NFT"}
            placeLabel={`停在${here}`}
          />
          {state.lastPlayerFaces ? (
            <p className="text-sm leading-6" data-testid="last-walk">
              擲出 {state.lastPlayerFaces[0]} 和 {state.lastPlayerFaces[1]}，走了{" "}
              {state.lastPlayerFaces[0] + state.lastPlayerFaces[1]} 格。
            </p>
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
          {state.dice < 2 ? (
            <p className="text-sm leading-6 text-[#9e3428]" data-testid="need-two">
              擲骰行棋要 2 顆，你現在只有 {state.dice} 顆。
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
