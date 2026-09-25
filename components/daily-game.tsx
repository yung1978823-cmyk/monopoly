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
  firstBuilt,
  parseSave,
  raiseTarget,
  reduce,
  remainingPurse,
  type GameState,
  type Landmark,
} from "@/lib/game";
import {
  DICE_CAP,
  PURSE_MAX,
  dayKeyOf,
  formatClock,
  msUntilNextDie,
  rollDie,
} from "@/lib/rules";
import { cn } from "cn";
import { useCallback, useEffect, useState } from "react";

function landmarkLabel(landmark: Landmark): string {
  if (landmark === "built") return "已建成";
  if (landmark === "ruined") return "廢墟";
  return "未建";
}

function DefensePips({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <span
          key={index}
          className={cn("size-2.5 rounded-sm", index < value ? "bg-[#1f6b4a]" : "bg-[#e7d7c2]")}
        />
      ))}
    </span>
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
  const [target, setTarget] = useState(0);
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

  const builtTargets = state.rivalLandmarks.flatMap((landmark, index) =>
    landmark === "built" ? [index] : [],
  );
  const selectedTarget = builtTargets.includes(target) ? target : (builtTargets[0] ?? 0);

  function rollPair(): [number, number] {
    return [rollDie(), rollDie()];
  }

  function onTestDie() {
    dispatch({ type: "add-test-die" });
  }

  function onBuild() {
    if (raiseTarget(state) === null) return;
    dispatch({ type: "build" });
  }

  function onAttack() {
    const current = state;
    if (current.dice < 2) return;
    const built = current.rivalLandmarks.flatMap((landmark, index) =>
      landmark === "built" ? [index] : [],
    );
    const chosen = built.length > 0 ? (built.includes(target) ? target : built[0]) : null;
    if (built.length === 0) {
      const purse = remainingPurse(current.hasNft, PURSE_MAX, current.rivalStolenToday);
      if (!current.hasNft || purse <= 0 || current.rivalStolenToday >= 5) return;
    }
    const dice = rollPair();
    dispatch({ type: "attack", dice, target: chosen, now: Date.now() });
  }

  const playerDefense = countBuilt(state.landmarks);
  const rivalDefense = countBuilt(state.rivalLandmarks);
  const playerPurse = remainingPurse(state.hasNft, state.postedPurse, state.playerStolenToday);
  const rivalPurse = remainingPurse(state.hasNft, PURSE_MAX, state.rivalStolenToday);
  const countdown =
    booted && now > 0 ? msUntilNextDie(state.dice, state.lastRefillAt, now) : null;
  const here = TILES[state.position]?.name ?? "起點";
  const pendingName =
    state.pendingBuildIndex === null ? null : LANDMARK_NAMES[state.pendingBuildIndex];
  const playerStrike = state.lastStrike?.attacker === "you" ? state.lastStrike : null;

  let statusTitle = "棋盤空著";
  let statusBody =
    "四個地標都還沒蓋。沒有 NFT 也可以走。骰子不出售，每 30 分鐘補 1 顆，最多存 20 顆。走一步要 2 顆。";
  let statusTone: "empty" | "first" | "wait" | "play" | "boot" = "empty";
  if (!booted) {
    statusTitle = "正在擺棋盤";
    statusBody = "四個地標位先空著。擺好就能走。";
    statusTone = "boot";
  } else if (pendingName) {
    statusTitle = `你站在${pendingName}`;
    statusBody = "要蓋的話，按小按鈕起地標。攻擊不必先蓋。";
    statusTone = "play";
  } else if (state.rollCount === 0 && state.dice === 0) {
    statusTone = "empty";
  } else if (state.dice === 1) {
    statusTitle = "只有 1 顆";
    statusBody = "攻擊要 2 顆。你現在只有 1 顆。再補一粒（測試），或等 30 分鐘。";
    statusTone = "wait";
  } else if (state.rollCount === 0 && state.dice >= 2) {
    statusTitle = "按攻擊";
    statusBody = "一按就擲兩顆，並跟阿強結算。幸運值、兩邊戰鬥力和 DST 會一起出來。";
    statusTone = "first";
  } else if (state.dice === 0) {
    statusTitle = "手上沒有骰子";
    statusBody = countdown
      ? `下一顆 ${formatClock(countdown)}。正式規則每 30 分鐘補 1 顆。走一步和攻擊都要 2 顆。`
      : "已滿 20 顆才會暫停補充。走一步和攻擊都要 2 顆。";
    statusTone = "wait";
  } else {
    statusTitle = `你在${here}`;
    statusBody = "再按攻擊。一按就擲兩顆並結算，不用先擲骰。";
    statusTone = "play";
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-[0.22em] text-[#9e3428]">每日棋盤</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-[#2a1c14]">大富翁</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#6f5b4b]">
            按攻擊就擲兩顆，並跟阿強結算。不用先擲骰。
          </p>
        </div>
        <div
          className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-[#9e3428] text-2xl font-bold text-[#9e3428]"
          aria-hidden="true"
        >
          富
        </div>
      </header>

      <section
        className="rounded-3xl border-2 border-[#9e3428] bg-[#fffaf3] p-4"
        data-testid="actions"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-[#6f5b4b]">分數</p>
            <p className="text-4xl font-bold tabular-nums text-[#2a1c14]" data-testid="score-now">
              {state.points}
            </p>
          </div>
          <div>
            <p className="text-sm text-[#6f5b4b]">DST</p>
            <p className="text-4xl font-bold tabular-nums text-[#1e7a62]" data-testid="dst-now">
              {state.rivalStolenToday}
            </p>
            <p className="text-xs text-[#6f5b4b]">阿強被拿走</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-sm text-[#6f5b4b]">這一手</p>
            <p className="text-lg font-semibold text-[#2a1c14]" data-testid="last-result">
              {playerStrike ? `拿走 ${playerStrike.dst} DST` : "還沒出手"}
            </p>
          </div>
        </div>
        <Button
          className="mt-4 h-24 w-full cursor-pointer text-3xl font-bold"
          onClick={onAttack}
          data-testid="attack"
        >
          攻擊
        </Button>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm leading-6" data-testid="luck">
              {playerStrike ? `幸運值 ${playerStrike.luck}` : "按攻擊就擲兩顆。"}
            </p>
            {playerStrike ? (
              <div className="mt-1 text-sm leading-6" data-testid="strike">
                <p>
                  你的戰鬥力 {playerStrike.yourPower} · 阿強的戰鬥力 {playerStrike.rivalPower}
                </p>
                <p className="font-medium text-[#1e7a62]">拿走 {playerStrike.dst} DST</p>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2">
            <DieFace value={playerStrike ? playerStrike.faces[0] : null} />
            <DieFace value={playerStrike ? playerStrike.faces[1] : null} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            className="h-10 cursor-pointer text-sm"
            variant="outline"
            onClick={onBuild}
            data-testid="raise"
          >
            起地標
          </Button>
          <Button
            className="h-10 cursor-pointer text-sm"
            variant="outline"
            onClick={onTestDie}
            data-testid="test-die"
          >
            補一粒（測試）
          </Button>
        </div>
        {state.dice < 2 ? (
          <p className="mt-2 text-sm leading-6 text-[#9e3428]" data-testid="need-two">
            攻擊要 2 顆，你現在只有 {state.dice} 顆。
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-[#6f5b4b]">
            手上 {state.dice}／20 顆。攻擊花 2 顆，一按就擲。
          </p>
        )}
      </section>

      <p className="rounded-2xl border border-[#eadcc6] bg-[#fffaf3] px-4 py-3 text-sm leading-6 text-[#3a2a1e]">
        分數不能換成 DST，也不計入賽季。骰子不出售，每 30 分鐘補 1 顆，最多存 20 顆。
      </p>

      {saveNote ? (
        <p className="rounded-2xl border border-[#e0bf78] bg-[#fbf3df] px-4 py-3 text-sm text-[#6a4b12]" role="status">
          {saveNote}
        </p>
      ) : null}

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.15fr)_23rem] lg:items-start">
        <section className="order-3 space-y-4 lg:order-none">
          <BoardRing
            position={state.position}
            landmarks={state.landmarks}
            points={state.points}
            defense={playerDefense}
            purseLabel={state.hasNft ? `錢包剩 ${playerPurse} DST` : "DST 進出 0"}
            placeLabel={state.rollCount === 0 ? "還在起點" : `停在${here}`}
          />
          <LandmarkStrip title="你的四個地標" landmarks={state.landmarks} />
          <section className="rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4" aria-live="polite">
            <h2 className="text-base font-semibold">這一局發生了什麼</h2>
            {state.log.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-[#6f5b4b]">
                還沒有紀錄。按攻擊，分數和 DST 會改。
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {state.log.map((entry) => (
                  <li
                    key={entry.id}
                    className={cn(
                      "rounded-2xl border px-3 py-2 text-sm leading-6",
                      entry.tone === "you" && "border-[#ead8b0] bg-[#fbf6ea]",
                      entry.tone === "rival" && "border-[#f0d0c8] bg-[#fdf4f1]",
                      entry.tone === "rule" && "border-[#d5ebe3] bg-[#f3faf7]",
                    )}
                  >
                    {entry.text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>

        <aside className="contents lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4">
          <section
            className={cn(
              "order-1 rounded-3xl border px-4 py-4 lg:order-none",
              statusTone === "first" && "border-[#9e3428] bg-[#9e3428] text-[#fff7ee]",
              statusTone === "empty" && "border-dashed border-[#c4b29a] bg-[#fffaf3] text-[#2a1c14]",
              statusTone === "wait" && "border-[#e0bf78] bg-[#fbf3df] text-[#3a2a1e]",
              (statusTone === "play" || statusTone === "boot") && "border-[#eadcc6] bg-[#fffaf3] text-[#2a1c14]",
            )}
            data-testid="status-banner"
          >
            <h2 className="text-xl font-semibold">{statusTitle}</h2>
            <p className={cn("mt-1 text-sm leading-6", statusTone === "first" ? "text-[#ffe8df]" : "text-[#6f5b4b]")}>
              {statusBody}
            </p>
          </section>

          <section className="order-2 rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4 lg:order-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">你的骰子</h2>
                <p className="mt-1 text-3xl font-bold tabular-nums" data-testid="dice-count">
                  {booted ? state.dice : "–"}
                  <span className="text-base font-medium text-[#6f5b4b]">／20 顆</span>
                </p>
              </div>
            </div>
            <p className="mt-2 text-sm leading-6">
              每 30 分鐘補 1 顆，不出售。滿 20 顆就停。
              {countdown ? (
                <>
                  {" "}
                  下一顆 <span className="font-semibold tabular-nums">{formatClock(countdown)}</span>。
                </>
              ) : booted && state.dice >= DICE_CAP ? (
                " 現在已滿，暫停補充。"
              ) : null}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#6f5b4b]">
              補一粒（測試）不用等。正式規則仍是每 30 分鐘補 1 顆，最多 20 顆。
            </p>
          </section>

          <section className="order-4 rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4 lg:order-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold" id="nft-label">
                  我有 NFT
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#6f5b4b]" id="nft-help">
                  試作開關。關掉：只計分數，DST 進出是 0。打開：你可以放出最多 5 DST，阿強是帶 5 DST 錢包的 NFT 防守方。
                </p>
              </div>
              <Switch
                checked={state.hasNft}
                onCheckedChange={(checked) => dispatch({ type: "set-nft", value: checked })}
                aria-labelledby="nft-label"
                aria-describedby="nft-help"
                data-testid="nft-switch"
                className="mt-1 shrink-0"
              />
            </div>
            {state.hasNft ? (
              <div className="mt-4">
                <p className="text-sm font-medium">今日放出</p>
                <div className="mt-2 grid grid-cols-6 gap-1.5" role="group" aria-label="今日放出的 DST">
                  {Array.from({ length: 6 }, (_, amount) => (
                    <Button
                      key={amount}
                      variant={state.postedPurse === amount ? "default" : "outline"}
                      className="h-10 cursor-pointer px-0 tabular-nums"
                      onClick={() => dispatch({ type: "set-purse", value: amount })}
                      aria-pressed={state.postedPurse === amount}
                    >
                      {amount}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-sm leading-6 text-[#6f5b4b]">
                  這是數字，不是鏈上錢包。一日最多放 5 DST。現在可被拿走 {playerPurse} DST，今日已被拿走{" "}
                  {state.playerStolenToday}／5。
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm font-medium text-[#1e7a62]">沒有 NFT，DST 進出是 0。</p>
            )}
          </section>

          <section className="order-5 rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4 lg:order-none">
            <h2 className="text-base font-semibold">街坊阿強</h2>
            <p className="mt-1 text-sm leading-6 text-[#6f5b4b]">
              這位對手在這台裝置上，不連線。他花自己的骰，不花你的。
              {state.hasNft ? " 他是 NFT 防守方，錢包 5 DST。" : " 你沒開 NFT，他砸了也拿走 0 DST。"}
            </p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2">
                戰鬥力 {rivalDefense}
                <DefensePips value={rivalDefense} />
              </span>
              <span className="tabular-nums text-[#6f5b4b]">骰子 {state.rivalDice}／20</span>
            </div>
            <p className="mt-2 text-sm leading-6">
              分數 {state.rivalPoints}
              <span className="text-[#1e7a62]"> · 錢包剩 {rivalPurse} DST</span>
              <span className="text-[#6f5b4b]"> · 今日已被拿走 {state.rivalStolenToday}／5</span>
            </p>
            <p className="mt-2 text-sm leading-6 text-[#6f5b4b]">
              {state.pendingBuildIndex !== null
                ? "你先決定要不要蓋。阿強等這一下。"
                : playerDefense === 0 && playerPurse === 0
                  ? "阿強在看。你還沒有可砸的地標，也沒有放出錢包。"
                  : state.rivalDice < 2
                    ? `阿強只有 ${state.rivalDice} 顆，湊不齊兩顆，這一下出不了手。`
                    : firstBuilt(state.landmarks) !== null
                      ? `你行動之後，阿強會花自己的 2 顆，瞄準${LANDMARK_NAMES[firstBuilt(state.landmarks) ?? 0]}。`
                      : "你沒有地標。阿強下一手花 2 顆，只打你放出的錢包。"}
            </p>
            <LandmarkStrip title="阿強的四個地標" landmarks={state.rivalLandmarks} />
            {builtTargets.length > 0 ? (
              <div className="mt-3" role="group" aria-label="要砸的地標">
                <p className="mb-2 text-sm font-medium">砸哪一座</p>
                <div className="grid grid-cols-2 gap-2">
                  {builtTargets.map((index) => (
                    <Button
                      key={index}
                      variant={selectedTarget === index ? "default" : "outline"}
                      className="h-10 cursor-pointer"
                      aria-pressed={selectedTarget === index}
                      onClick={() => setTarget(index)}
                    >
                      {LANDMARK_NAMES[index]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mt-2 text-xs leading-5 text-[#6f5b4b]">
              {state.dice === 1
                ? "攻擊要 2 顆，你現在只有 1 顆。"
                : state.hasNft
                  ? `攻擊＝你的戰鬥力＋幸運值。低過阿強的戰鬥力拿 0，等於拿 1，高過按算式拿，且不超過他剩下的 ${rivalPurse} DST。`
                  : "沒有 NFT，就算砸中也拿走 0 DST。雙方只得分數。"}
            </p>
          </section>

          <section className="order-6 rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4 text-sm leading-6 lg:order-none">
            <h2 className="text-base font-semibold">攻擊怎麼算</h2>
            <p className="mt-2">
              走一步花 2 顆，擲兩顆，幸運值是和，2 至 12，走那麼多格。戰鬥力等於已建成的地標，0 至 4。你和阿強都一樣。
            </p>
            <ul className="mt-2 space-y-1">
              <li>攻擊也花 2 顆。攻擊合計＝你的戰鬥力＋幸運值。防守合計＝阿強的戰鬥力。</li>
              <li>攻擊低過防守：0 DST，地標守住。</li>
              <li>等於：1 DST，砸碎一座。</li>
              <li>高過：min(5, max(2, 攻擊 − 防守 + 1)) DST，仍不超過剩餘錢包和當日 5 DST。</li>
            </ul>
            <p className="mt-2 text-[#6f5b4b]">
              例：戰鬥力 0、幸運值 2、對方戰鬥力 4，攻擊 2，拿走 0。戰鬥力 0、幸運值 4、對方 4，拿走 1。戰鬥力 0、幸運值 12、對方 0，拿走 5。
            </p>
            <p className="mt-2">走到一格 +1 分。經過起點另 +2 分。起地標 +3 分。這些分數留在棋盤上，不能換成 DST。</p>
          </section>

          <Button
            variant="ghost"
            className="order-7 h-10 w-full cursor-pointer text-[#6f5b4b] lg:order-none"
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
        </aside>
      </div>
    </main>
  );
}
