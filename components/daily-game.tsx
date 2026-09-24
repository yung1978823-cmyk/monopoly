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
  previewMove,
  reduce,
  remainingPurse,
  rivalCanStrike,
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
import { useCallback, useEffect, useRef, useState } from "react";

const actionButton =
  "h-12 w-full cursor-pointer px-4 text-base disabled:cursor-not-allowed";

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
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinFace, setSpinFace] = useState<number | null>(null);
  const [spinWho, setSpinWho] = useState<"you" | "rival" | null>(null);
  const [target, setTarget] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const timers = useRef<number[]>([]);

  const dispatch = useCallback((action: Parameters<typeof reduce>[1]) => {
    setState((current) => reduce(current, action));
  }, []);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
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
    return () => {
      alive.current = false;
      window.clearTimeout(id);
      pending.forEach((timerId) => window.clearTimeout(timerId));
    };
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

  async function pause(ms: number) {
    await new Promise<void>((resolve) => {
      const id = window.setTimeout(resolve, ms);
      timers.current.push(id);
    });
  }

  async function spin(roll: number) {
    setSpinning(true);
    for (let step = 0; step < 7; step += 1) {
      setSpinFace(rollDie());
      await pause(70);
      if (!alive.current) return;
    }
    setSpinFace(roll);
    setSpinning(false);
    await pause(180);
  }

  async function playRival(from: GameState) {
    if (!alive.current || !rivalCanStrike(from)) return;
    const roll = rollDie();
    setSpinWho("rival");
    await spin(roll);
    if (!alive.current) return;
    dispatch({ type: "rival", roll, now: Date.now() });
  }

  async function withLock(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function onTestDie() {
    dispatch({ type: "add-test-die" });
  }

  function onRoll() {
    const current = state;
    if (current.dice <= 0 || current.pendingBuildIndex !== null) return;
    void withLock(async () => {
      const roll = rollDie();
      const stamp = Date.now();
      setSpinWho("you");
      await spin(roll);
      if (!alive.current) return;
      const next = previewMove(current, roll, stamp);
      dispatch({ type: "move", roll, now: stamp });
      if (next.pendingBuildIndex !== null) return;
      await pause(420);
      await playRival(next);
    });
  }

  function onBuild(skip: boolean) {
    const current = state;
    if (current.pendingBuildIndex === null) return;
    void withLock(async () => {
      const next = reduce(current, skip ? { type: "skip-build" } : { type: "build" });
      dispatch(skip ? { type: "skip-build" } : { type: "build" });
      await pause(360);
      await playRival(next);
    });
  }

  function onAttack() {
    const current = state;
    if (current.dice <= 0 || current.pendingBuildIndex !== null) return;
    const built = current.rivalLandmarks.flatMap((landmark, index) =>
      landmark === "built" ? [index] : [],
    );
    const chosen = built.length > 0 ? (built.includes(target) ? target : built[0]) : null;
    if (built.length === 0) {
      const purse = remainingPurse(current.hasNft, PURSE_MAX, current.rivalStolenToday);
      if (!current.hasNft || purse <= 0 || current.rivalStolenToday >= 5) return;
    }
    void withLock(async () => {
      const roll = rollDie();
      const stamp = Date.now();
      setSpinWho("you");
      await spin(roll);
      if (!alive.current) return;
      const next = reduce(current, { type: "attack", roll, target: chosen, now: stamp });
      dispatch({ type: "attack", roll, target: chosen, now: stamp });
      if (next === current) return;
      await pause(420);
      await playRival(next);
    });
  }

  const playerDefense = countBuilt(state.landmarks);
  const rivalDefense = countBuilt(state.rivalLandmarks);
  const playerPurse = remainingPurse(state.hasNft, state.postedPurse, state.playerStolenToday);
  const rivalPurse = remainingPurse(state.hasNft, PURSE_MAX, state.rivalStolenToday);
  const countdown =
    booted && now > 0 ? msUntilNextDie(state.dice, state.lastRefillAt, now) : null;
  const face = spinning ? spinFace : spinWho === "rival" ? state.lastRivalRoll : state.lastPlayerRoll;
  const here = TILES[state.position]?.name ?? "起點";
  const pendingName =
    state.pendingBuildIndex === null ? null : LANDMARK_NAMES[state.pendingBuildIndex];
  const attackName =
    builtTargets.length > 0 ? LANDMARK_NAMES[selectedTarget] : null;
  const canAttackPurse =
    state.hasNft && rivalPurse > 0 && state.rivalStolenToday < 5 && builtTargets.length === 0;
  const canAttack =
    state.dice > 0 &&
    state.pendingBuildIndex === null &&
    (attackName !== null || canAttackPurse);

  let statusTitle = "棋盤空著";
  let statusBody =
    "四個地標都還沒蓋。沒有 NFT 也可以走。骰子不出售，每 30 分鐘補 1 顆，最多存 20 顆。";
  let statusTone: "empty" | "first" | "wait" | "play" | "boot" = "empty";
  if (!booted) {
    statusTitle = "正在擺棋盤";
    statusBody = "四個地標位先空著。擺好就能走。";
    statusTone = "boot";
  } else if (pendingName) {
    statusTitle = `你站在${pendingName}`;
    statusBody = "這一格可以蓋成地標。蓋成之後防守加 1，並得 3 分。";
    statusTone = "play";
  } else if (state.rollCount === 0 && state.dice === 0) {
    statusTone = "empty";
  } else if (state.rollCount === 0 && state.dice > 0) {
    statusTitle = "第一粒在手上";
    statusBody = "擲 1 至 6，只在這塊棋盤上走。先得到的是分數，不是 DST。";
    statusTone = "first";
  } else if (state.dice === 0) {
    statusTitle = "手上沒有骰子";
    statusBody = countdown
      ? `下一顆 ${formatClock(countdown)}。正式規則每 30 分鐘補 1 顆。要接著走，用補一粒（測試）。`
      : "已滿 20 顆才會暫停補充。要接著走，用補一粒（測試）。";
    statusTone = "wait";
  } else {
    statusTitle = `你在${here}`;
    statusBody = "再擲一顆，或花一顆去砸阿強沒守住的地標。";
    statusTone = "play";
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-[0.22em] text-[#9e3428]">每日棋盤</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-[#2a1c14]">大富翁</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#6f5b4b]">
            一個人的圈，四個地標。擲一顆骰往前走，先得到的是分數。
          </p>
        </div>
        <div
          className="grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-[#9e3428] text-2xl font-bold text-[#9e3428]"
          aria-hidden="true"
        >
          富
        </div>
      </header>

      <p className="rounded-2xl border border-[#eadcc6] bg-[#fffaf3] px-4 py-3 text-sm leading-6 text-[#3a2a1e]">
        分數不能換成 DST，也不計入賽季。骰子不出售，每 30 分鐘補 1 顆，最多存 20 顆。
      </p>

      {saveNote ? (
        <p className="rounded-2xl border border-[#e0bf78] bg-[#fbf3df] px-4 py-3 text-sm text-[#6a4b12]" role="status">
          {saveNote}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_23rem]">
        <section className="order-2 space-y-4 lg:order-1">
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
                還沒有紀錄。補一粒骰，擲出第一格。分數和 DST 會分開寫。
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

        <aside className="order-1 space-y-4 lg:sticky lg:top-4 lg:order-2">
          <section
            className={cn(
              "rounded-3xl border px-4 py-4",
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
            {pendingName ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button className={actionButton} disabled={busy} onClick={() => onBuild(false)}>
                  蓋成地標
                </Button>
                <Button
                  className={actionButton}
                  variant="outline"
                  disabled={busy}
                  onClick={() => onBuild(true)}
                >
                  先不蓋
                </Button>
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">你的骰子</h2>
                <p className="mt-1 text-3xl font-bold tabular-nums" data-testid="dice-count">
                  {booted ? state.dice : "–"}
                  <span className="text-base font-medium text-[#6f5b4b]">／20 顆</span>
                </p>
              </div>
              <DieFace value={booted ? face : null} spinning={spinning} />
            </div>
            <p className="mt-3 text-sm leading-6 text-[#6f5b4b]">
              {spinning
                ? spinWho === "rival"
                  ? "阿強在擲。"
                  : "骰子還在轉。"
                : spinWho === "rival" && state.lastRivalRoll
                  ? `阿強擲出 ${state.lastRivalRoll}。`
                  : state.lastPlayerRoll
                    ? `你擲出 ${state.lastPlayerRoll}。`
                    : "還沒擲過。"}
            </p>
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
            <div className="mt-3 grid gap-2">
              <Button
                className={actionButton}
                variant={state.dice > 0 ? "default" : "outline"}
                disabled={!booted || busy || state.dice === 0 || state.pendingBuildIndex !== null}
                onClick={onRoll}
                data-testid="roll-move"
              >
                {state.rollCount === 0 ? "擲出第一粒" : "擲骰前進"}
              </Button>
              <Button
                className={actionButton}
                variant={state.dice === 0 ? "default" : "outline"}
                disabled={!booted || busy || state.dice >= DICE_CAP}
                onClick={onTestDie}
                data-testid="test-die"
              >
                補一粒（測試）
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#6f5b4b]">
              補一粒（測試）不用等。正式規則仍是每 30 分鐘補 1 顆，最多 20 顆。
            </p>
          </section>

          <section className="rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4">
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
                disabled={!booted || busy}
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
                      disabled={busy}
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

          <section className="rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4">
            <h2 className="text-base font-semibold">街坊阿強</h2>
            <p className="mt-1 text-sm leading-6 text-[#6f5b4b]">
              這位對手在這台裝置上，不連線。他花自己的骰，不花你的。
              {state.hasNft ? " 他是 NFT 防守方，錢包 5 DST。" : " 你沒開 NFT，他砸了也拿走 0 DST。"}
            </p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2">
                防守 {rivalDefense}
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
                  : state.rivalDice <= 0
                    ? "阿強沒有骰子，這一下出不了手。"
                    : firstBuilt(state.landmarks) !== null
                      ? `你行動之後，阿強會花自己的 1 顆，瞄準${LANDMARK_NAMES[firstBuilt(state.landmarks) ?? 0]}。`
                      : "你沒有地標。阿強下一手只打你放出的錢包。"}
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
                      disabled={busy}
                      aria-pressed={selectedTarget === index}
                      onClick={() => setTarget(index)}
                    >
                      {LANDMARK_NAMES[index]}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <Button
              className={cn(actionButton, "mt-3")}
              variant="secondary"
              disabled={!booted || busy || !canAttack}
              onClick={onAttack}
              data-testid="attack"
            >
              {attackName ? `砸${attackName}（花 1 顆）` : canAttackPurse ? "對錢包擲骰（花 1 顆）" : "現在砸不了"}
            </Button>
            <p className="mt-2 text-xs leading-5 text-[#6f5b4b]">
              {state.hasNft
                ? `點數低過防守拿 0，等於拿 1，高過按算式拿，且不超過阿強剩下的 ${rivalPurse} DST。`
                : "沒有 NFT，就算砸中也拿走 0 DST。雙方只得分數。"}
            </p>
          </section>

          <section className="rounded-3xl border border-[#eadcc6] bg-[#fffaf3] p-4 text-sm leading-6">
            <h2 className="text-base font-semibold">攻擊怎麼算</h2>
            <p className="mt-2">防守等於已建成的地標數，0 至 4。攻擊花 1 顆，擲 1 至 6。</p>
            <ul className="mt-2 space-y-1">
              <li>點數低過防守：0 DST，地標守住。</li>
              <li>點數等於防守：1 DST，砸碎一座。</li>
              <li>點數高過防守：min(5, max(2, 點數 − 防守 + 1)) DST，也不得多過剩餘錢包和當日 5 DST。</li>
            </ul>
            <p className="mt-2 text-[#6f5b4b]">
              例：防守 4、擲 4，拿走 1。防守 4、擲 3，拿走 0。防守 0、擲 6，拿走 5。
            </p>
            <p className="mt-2">走到一格 +1 分。經過起點另 +2 分。蓋成地標 +3 分。這些分數留在棋盤上。</p>
          </section>

          <Button
            variant="ghost"
            className="h-10 w-full cursor-pointer text-[#6f5b4b]"
            disabled={!booted || busy}
            onClick={() => {
              if (!resetArmed) {
                setResetArmed(true);
                return;
              }
              const stamp = Date.now();
              dispatch({ type: "reset", now: stamp, dayKey: dayKeyOf(stamp) });
              setSpinWho(null);
              setSpinFace(null);
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
