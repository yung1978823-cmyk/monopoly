"use client";

import { AttackScreen } from "@/components/attack-screen";
import { PetScreen } from "@/components/pet-screen";
import { StealScreen } from "@/components/steal-screen";
import { AttackIntro, ATTACK_INTRO_MS } from "@/components/attack-intro";
import { MyCity } from "@/components/my-city";
import { RealmScreen } from "@/components/realm-screen";
import { TableGame } from "@/components/table-game";
import { type Burst } from "@/components/board-ring";
import { DailyBoard, type DailyFloat } from "@/components/daily-board";
import { CHARACTERS, savePick, savedPick } from "@/lib/characters";
import { LangPicker } from "@/components/lang-picker";
import { TipHand } from "@/components/tip-hand";
import { Button } from "@/components/ui/button";
import { TILES, TILE_INFO } from "@/lib/board";
import { THEMES } from "@/lib/themes";
import { ELEMENTS, HATCH_ROLLS, growNeed, petName, rollElement } from "@/lib/pet";
import {
  STORAGE_KEY,
  attackPower,
  cheapestUpgrade,
  standingIndexes,
  totalLevels,
  createGame,
  holdsNft,
  parseSave,
  reduce,
  type GameState,
  type StealBox,
  SAVE_PAGES,
} from "@/lib/game";
import { BUILDINGS, DAILY_DST_CAP, DICE_CAP, MAX_LEVEL, REFILL_MS, dayKeyOf, formatClock, msUntilNextDie, rollDie } from "@/lib/rules";
import { cn } from "cn";
import { useLang } from "@/lib/i18n";
import { isMuted, play, setMuted, type Sound } from "@/lib/sfx";
import { useCallback, useEffect, useRef, useState } from "react";

const STEP_MS = 240;
/** How long the 🔨 swoop plays before the attack screen opens. */
const INTRO_MS = ATTACK_INTRO_MS;

type PendingWalk = {
  faces: [number, number];
  steps: number;
  from: number;
  step: number;
  enemyDice: [number, number] | null;
  rivalLevels: number[];
  rivalCity: number;
  rivalFace: number;
  rivalElement: number;
  rivalNfts: number;
  chest: number;
  chestMeat: boolean;
  stealBoxes: StealBox[];
  running: boolean;
  committed: boolean;
};

/** Stand-in NFTs until wallet NFTs are wired in: tapping an empty slot places the next one. */
const NFT_STANDINS = [
  { id: "nft-vampire", icon: "🧛" },
  { id: "nft-jiangshi", icon: "🧟" },
  { id: "nft-ghost", icon: "👻" },
  { id: "nft-bat", icon: "🦇" },
  { id: "nft-pumpkin", icon: "🎃" },
] as const;

function nftIcon(id: string): string {
  return NFT_STANDINS.find((nft) => nft.id === id)?.icon ?? "💎";
}

/** Five NFT slots and nothing else: a filled slot is an NFT you hold, and each one adds attack. */
function NftSlots({
  nfts,
  onPlace,
  onRemove,
}: {
  nfts: (string | null)[];
  onPlace: (slot: number, id: string) => void;
  onRemove: (slot: number) => void;
}) {
  const { t } = useLang();
  const next = NFT_STANDINS.find((nft) => !nfts.includes(nft.id));
  return (
    <div className="grid grid-cols-5 gap-2" data-testid="nft-slots">
      {nfts.map((id, slot) =>
        id ? (
          <button
            key={slot}
            type="button"
            onClick={() => onRemove(slot)}
            className="relative flex aspect-square cursor-pointer items-center justify-center rounded-2xl border-[3px] border-[#FBD000] bg-gradient-to-b from-[#8B5CF6] to-[#4C1D95] text-3xl shadow-[0_4px_0_#2E1065] animate-[pop_0.3s_ease-out]"
            aria-label={t("拎走 NFT {n}", { n: slot + 1 })}
            data-testid={`nft-${slot}`}
          >
            {nftIcon(id)}
            <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-[#4C1D95] shadow">
              ✕
            </span>
          </button>
        ) : (
          <button
            key={slot}
            type="button"
            onClick={() => next && onPlace(slot, next.id)}
            disabled={!next}
            className="flex aspect-square cursor-pointer items-center justify-center rounded-2xl border-[3px] border-dashed border-[#8B5CF6]/50 bg-[#F3EEFF] text-2xl font-black text-[#8B5CF6]/60"
            aria-label={t("放 NFT 入第 {n} 格", { n: slot + 1 })}
            data-testid={`nft-${slot}`}
          >
            +
          </button>
        ),
      )}
    </div>
  );
}

/** Turn the last stop into its board effect: the square's picture and what it paid. */
function burstOf(state: GameState): Burst | null {
  const landing = state.landing;
  if (!landing || landing.kind === "attack") return null;
  return {
    key: state.rollCount,
    index: state.position,
    icon: TILE_INFO[landing.kind].icon,
    art: TILE_INFO[landing.kind].art,
    money: landing.points,
    dice: landing.dice,
    meat: landing.meat,
    bad: landing.kind === "jail" || landing.kind === "hole",
  };
}

/** Words to float up from the ship for a stop's burst. */
function floatOf(burst: Burst | null, t: (text: string) => string): DailyFloat | null {
  if (!burst) return null;
  // Only the cheer is used now; the big pop-up shows what was won.
  if (!burst.money && !burst.dice && !burst.meat) return null;
  void t;
  return {
    key: burst.key,
    text: "",
    colour: burst.bad || burst.money < 0 ? "#DC2626" : "#16A34A",
    cheer: burst.money >= 3 || burst.dice > 0 || (burst.meat ?? 0) >= 3,
  };
}

export function DailyGame() {
  const [state, setState] = useState<GameState>(() => createGame(0, "1970-01-01"));
  const [booted, setBooted] = useState(false);
  const { t } = useLang();
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mute, setMute] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMute(isMuted()), 0);
    return () => window.clearTimeout(id);
  }, []);
  const [pending, setPending] = useState<PendingWalk | null>(null);
  /** The roll whose attack intro has already played. */
  const [introSeen, setIntroSeen] = useState(-1);
  /** Whether your own town (opened with 🏗️) is showing instead of the board. */
  const [cityOpen, setCityOpen] = useState(false);
  /** Whether the public table (第二層) is showing instead of the board. */
  const [tableOpen, setTableOpen] = useState(false);
  const [realmOpen, setRealmOpen] = useState(false);
  /** Whether your monster's screen (🐾) is showing. */
  const [petOpen, setPetOpen] = useState(false);
  /** A dragon that just hatched on the board, shown in a banner for a moment. */
  const [hatchedNow, setHatchedNow] = useState<number | null>(null);
  const petStage = useRef<number | null>(null);
  /** A look-only preview of a dragon from the link (?dragon=0-1 is a light N); the save isn't touched. */
  const [preview, setPreview] = useState<{ element: number; stage: number } | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("dragon");
    const [element, stage] = (v ?? "").split("-").map(Number);
    if (!(element >= 0 && element <= 2 && stage >= 1 && stage <= 4)) return;
    const id = window.setTimeout(() => setPreview({ element, stage }), 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    const stage = state.pet?.stage ?? null;
    const was = petStage.current;
    petStage.current = stage;
    if (was !== 0 || stage === null || stage < 1 || !state.pet) return;
    const element = state.pet.element;
    const show = window.setTimeout(() => {
      setHatchedNow(element);
      play("chest");
    }, 400);
    const hide = window.setTimeout(() => setHatchedNow(null), 3600);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [state.pet]);
  /** The board and the open space it is centred in, for the camera; GO presses glide it home. */
  const [goPresses, setGoPresses] = useState(0);
  /** Your character (shared with the public table's picker). */
  const [pick, setPick] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setPick(savedPick()), 0);
    return () => window.clearTimeout(id);
  }, []);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, pages: SAVE_PAGES, state }));
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
    const playerDue = state.dice < DICE_CAP && now - state.lastRefillAt >= REFILL_MS;
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

  // Each stop plays its square's sound once, when the walk lands.
  const soundedRoll = useRef(-1);
  useEffect(() => {
    if (!pending?.committed || !state.landing || soundedRoll.current === state.rollCount) return;
    soundedRoll.current = state.rollCount;
    const sounds: Partial<Record<string, Sound>> = {
      start: "coin",
      coin: "coin",
      chest: "chest",
      meat: "coin",
      steal: "lucky",
      lucky: "lucky",
      jail: "bad",
      hole: "bad",
      attack: "attack",
    };
    const sound = sounds[state.landing.kind];
    if (sound) play(sound);
  }, [pending?.committed, state.landing, state.rollCount]);

  // The landing picture shows once per roll. Leaving for another page hides the board and coming back would
  // replay its CSS animation, so after it has faded we remember that roll and stop drawing it.
  const [popGone, setPopGone] = useState(-1);
  useEffect(() => {
    if (!pending?.committed || !state.landing) return;
    const roll = state.rollCount;
    const timer = window.setTimeout(() => setPopGone(roll), 3300);
    return () => window.clearTimeout(timer);
  }, [pending?.committed, state.landing, state.rollCount]);

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
      play("step");
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
        rivalLevels: move.rivalLevels,
        rivalCity: move.rivalCity,
        rivalFace: move.rivalFace,
        rivalElement: move.rivalElement,
        rivalNfts: move.rivalNfts,
        chest: move.chest,
        chestMeat: move.chestMeat,
        stealBoxes: move.stealBoxes,
        now: Date.now(),
      });
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [pending, dispatch]);

  function onWalk() {
    if (state.phase !== "walk" || state.dice < 1 || pending?.running) return;
    play("roll");
    setGoPresses((count) => count + 1);
    const faces = rollPair();
    const steps = faces[0] + faces[1];
    const from = state.position;
    const nextIndex = (from + steps) % TILES.length;
    const enemyDice = TILES[nextIndex]?.kind === "attack" ? rollPair() : null;
    // Each 攻擊 square meets another character on a page near yours (one before, the same or one
    // after), with five buildings at random levels — never all five at 5, as that page would be finished.
    const rivalCity = Math.max(0, Math.min(THEMES.length - 1, state.theme + Math.floor(Math.random() * 3) - 1));
    const rivalLevels = Array.from({ length: BUILDINGS }, () => Math.floor(Math.random() * (MAX_LEVEL + 1)));
    if (rivalLevels.every((level) => level >= MAX_LEVEL)) rivalLevels[0] = MAX_LEVEL - 1;
    const others = CHARACTERS.map((_, i) => i).filter((i) => i !== pick);
    const rivalFace = others[Math.floor(Math.random() * others.length)];
    const rivalElement = rollElement(Math.random());
    const chest = 3 + Math.floor(Math.random() * 4);
    const rivalNfts = 1 + Math.floor(Math.random() * 5);
    // A chest holds 🍖 half the time. A rival's store (on 偷嘢): two crates of 🧪, one of 🍖 or coins, shuffled.
    const chestMeat = Math.random() < 0.5;
    const stealBoxes: StealBox[] = [
      { kind: "juice", amount: 1 + Math.floor(Math.random() * 3) },
      { kind: "juice", amount: 1 + Math.floor(Math.random() * 3) },
      Math.random() < 0.5 ? { kind: "meat", amount: 3 } : { kind: "coins", amount: 4 },
    ].sort(() => Math.random() - 0.5) as StealBox[];
    setPending({ faces, steps, from, step: 0, enemyDice, rivalLevels, rivalCity, rivalFace, rivalElement, rivalNfts, chest, chestMeat, stealBoxes, running: true, committed: false });
  }

  function onBuild() {
    if (pending?.running) return;
    setCityOpen(true);
  }

  function onWeapon(target: number | null = null) {
    if (state.phase !== "search" || state.fightSettled) return;
    dispatch({ type: "weapon", target, roll: Math.random() });
  }

  /** Test helper: someone knocks one of your standing buildings down a level. */
  function onRaided() {
    const standing = standingIndexes(state.levels);
    if (standing.length === 0) return;
    dispatch({ type: "raided", target: standing[Math.floor(Math.random() * standing.length)] });
  }

  const weapon = totalLevels(state.levels);
  const power = attackPower(state);
  const shownStep = pending?.step ?? 0;
  const tokenIndex = pending ? (pending.from + shownStep) % TILES.length : state.position;
  const arrived = pending !== null && shownStep > 0;
  const countdown = booted && now > 0 ? msUntilNextDie(state.dice, state.lastRefillAt, now) : null;
  const buildCost = cheapestUpgrade(state);
  const buildable = buildCost !== null && state.points >= buildCost;
  const petNeed = state.pet ? growNeed(state.pet) : null;
  /** No monster yet, or enough food to grow it: the 🐾 button glows. */
  const petReady = !state.pet || (!!petNeed && state.meat >= petNeed[0] && state.juice >= petNeed[1]);

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

  if (realmOpen && state.phase === "walk") {
    return <RealmScreen onExit={() => setRealmOpen(false)} />;
  }
  if (tableOpen && state.phase === "walk") {
    return <TableGame onExit={() => setTableOpen(false)} />;
  }

  if (cityOpen && state.phase === "walk") {
    return (
      <MyCity
        state={state}
        onUpgrade={(building) => dispatch({ type: "upgrade", building })}
        onClose={() => setCityOpen(false)}
      />
    );
  }

  if (petOpen && state.phase === "walk") {
    return (
      <PetScreen
        state={state}
        onPick={(element) => dispatch({ type: "pick-pet", element })}
        onGrow={() => dispatch({ type: "grow-pet" })}
        onClose={() => setPetOpen(false)}
      />
    );
  }

  if (state.phase === "steal") {
    return <StealScreen state={state} onPick={(index) => dispatch({ type: "steal-pick", index })} onReturn={returnToBoard} />;
  }

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
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#0B1B3F] text-[#1E3A8A] [container-type:size]"
      data-testid="walk"
    >
      {/* Floating-island board in 3D: drag to turn, pinch to zoom; the ship is you. */}
      <DailyBoard
        key={pick}
        actor={CHARACTERS[pick]?.actor}
        position={tokenIndex}
        stopIndex={arrived ? tokenIndex : null}
        float={pending?.committed ? floatOf(burstOf(state), t) : null}
        recentreKey={goPresses}
        ready={state.dice > 0 && !pending?.running}
        onGo={onWalk}
        dice={pending ? { key: goPresses, faces: [pending.faces[0], pending.faces[1]] } : null}
        // No dragon yet: an egg waits on the stone — tap it to take it.
        pet={
          preview
            ? { element: preview.element, stage: preview.stage, legend: false, hungry: false }
            : state.pet
            ? { element: state.pet.element, stage: state.pet.stage, legend: holdsNft(state), hungry: state.pet.hungry > 0, rolls: state.pet.rolls, hatchAt: HATCH_ROLLS }
            : { element: 0, stage: 0, legend: false, hungry: false }
        }
        onEggTap={() => !pending?.running && setPetOpen(true)}
      />
      {/* What you got on the square you stopped on: its picture big in the middle, then what it paid (Sky: the words were too small). */}
      {pending?.committed && state.landing && state.landing.kind !== "attack" && popGone !== state.rollCount ? (
        <div
          key={state.rollCount}
          className="pointer-events-none absolute inset-x-0 top-[26%] z-40 flex flex-col items-center opacity-75 animate-[pop_0.35s_ease-out,fade-out_0.6s_ease-in_2.6s_forwards]"
          data-testid="landing-pop"
        >
          <img src={`/art/icons/${state.landing.kind}.webp`} alt="" draggable={false} className="size-[38cqw] max-h-40 max-w-40 object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.45)]" />
          <p
            className={cn(
              "mt-1 rounded-full border-4 px-5 py-1 text-2xl font-black text-white shadow-xl",
              state.landing.kind === "jail" || state.landing.kind === "hole" ? "border-white/70 bg-[#46506E]" : "border-[#FBD000] bg-[#1E3A8A]",
            )}
          >
            {t(TILE_INFO[state.landing.kind].name)}
          </p>
          {state.landing.points || state.landing.dice || state.landing.meat ? (
            <p className="mt-2 flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-1.5 text-3xl font-black tabular-nums text-[#1E3A8A] shadow-xl">
              {state.landing.points ? (
                <span className={cn("flex items-center gap-1", state.landing.points < 0 && "text-[#E52521]")}>
                  <img src={TILE_INFO.coin.art} alt={t("金幣")} className="size-8" />
                  {state.landing.points > 0 ? "+" : "−"}
                  {Math.abs(state.landing.points)}
                </span>
              ) : null}
              {state.landing.dice ? <span>+{state.landing.dice}🎲</span> : null}
              {state.landing.meat ? <span>+{state.landing.meat}🍖</span> : null}
            </p>
          ) : null}
        </div>
      ) : null}
      {hatchedNow !== null ? (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] z-40 flex flex-col items-center animate-[pop_0.45s_ease-out]" data-testid="hatched">
          <p className="rounded-3xl border-4 border-[#FBD000] bg-[#1E3A8A] px-6 py-2 text-3xl font-black text-white shadow-2xl">{t("🐉 孵化咗！")}</p>
          <p className="mt-2 rounded-full px-4 py-1 text-xl font-black text-white shadow-lg" style={{ background: ELEMENTS[hatchedNow].colour }}>
            {t("你隻係{name}", { name: t(petName({ element: hatchedNow, stage: 1, hungry: 0, rolls: 0 }, holdsNft(state))) })}
          </p>
        </div>
      ) : null}
      {/* First time: point at the GO stone in the middle. */}
      {state.rollCount === 0 && !pending ? <TipHand className="left-1/2 top-[42%] z-20 -translate-x-1/2" /> : null}
      {/* Top bar: dice and points only; everything else lives behind the menu. */}
      <header className="relative z-30 flex items-center justify-between gap-2 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="relative">
          <div className="flex items-center gap-1.5 rounded-full border-2 border-[#FBD000] bg-[#1E3A8A] py-1 pl-2 pr-3 text-lg font-black tabular-nums text-white shadow-md" data-testid="dice-count">
            <img src="/art/ui/dice.webp" alt="" draggable={false} className="-my-2 -ml-3 size-10 object-contain drop-shadow" />
            <span key={state.dice} className="inline-block animate-[bump_0.35s_ease-out]">{state.dice}</span>
          </div>
          {/* Time to the next free die, just the clock numbers, under the dice count. */}
          {countdown ? (
            <span className="absolute left-1/2 top-full mt-0.5 h-4 -translate-x-1/2 rounded-full bg-black/35 px-1.5 text-[11px] font-bold leading-4 tabular-nums text-white" data-testid="need-two">
              {formatClock(countdown)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 rounded-full border-2 border-[#FBD000] bg-white py-1 pl-2 pr-3 text-lg font-black tabular-nums text-[#1E3A8A] shadow-md" data-testid="hud-points">
          <img src="/art/ui/coin.webp" alt={t("金幣")} draggable={false} className="-my-2 -ml-3 size-10 object-contain drop-shadow" />
          <span key={state.points} className="inline-block animate-[bump_0.35s_ease-out]">{state.points}</span>
        </div>
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => !pending?.running && setPetOpen(true)}
          className="relative flex size-12 shrink-0 cursor-pointer items-center justify-center active:scale-90"
          aria-label={t("你隻怪獸")}
          data-testid="open-pet"
        >
          <img
            src="/art/ui/pet.webp"
            alt=""
            draggable={false}
            className={cn("size-12 object-contain drop-shadow-[0_3px_2px_rgba(0,0,0,0.45)]", petReady && "animate-[icon-glow_1.8s_ease-in-out_infinite]")}
          />
          {state.pet && state.pet.hungry > 0 ? <span className="absolute -right-1 -top-1 text-sm">❗</span> : null}
        </button>
        <button
          type="button"
          onClick={() => !pending?.running && setTableOpen(true)}
          className="flex size-12 shrink-0 cursor-pointer items-center justify-center active:scale-90"
          aria-label={t("公開桌")}
          data-testid="open-table"
        >
          <img src="/art/ui/table.webp" alt="" draggable={false} className="size-11 object-contain drop-shadow-[0_3px_2px_rgba(0,0,0,0.45)]" />
        </button>
        <button
          type="button"
          onClick={() => !pending?.running && setRealmOpen(true)}
          className="flex size-12 shrink-0 cursor-pointer items-center justify-center active:scale-90"
          aria-label={t("領地")}
          data-testid="open-realm"
        >
          <img src="/art/ui/land.webp" alt="" draggable={false} className="size-12 object-contain drop-shadow-[0_3px_2px_rgba(0,0,0,0.45)]" />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex size-12 shrink-0 cursor-pointer items-center justify-center active:scale-90"
          aria-label={t("設定")}
          data-testid="menu"
        >
          <img src="/art/ui/gear.webp" alt="" draggable={false} className="size-11 object-contain drop-shadow-[0_3px_2px_rgba(0,0,0,0.45)]" />
        </button>
        </div>
      </header>

      {saveNote ? (
        <p className="relative z-30 mx-3 rounded-2xl bg-[#FFFFFF] px-4 py-2 text-xs text-[#1E3A8A]" role="status">
          {t(saveNote)}
        </p>
      ) : null}

      {/* The open space between the bars: the board is centred here. Taps fall through to the camera. */}
      <section className="pointer-events-none relative z-20 min-h-0 flex-1" />

      {/* Bottom bar: building sits to the side; the dice clock in the middle. */}
      {/* The footer lets taps through to the board (the GO stone sits just above it); only its buttons take taps. */}
      <footer className="pointer-events-none relative z-30 flex items-end justify-center px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
        <button
          type="button"
          onClick={onBuild}
          disabled={pending?.running === true}
          className="pointer-events-auto absolute bottom-[max(env(safe-area-inset-bottom),1rem)] left-5 flex cursor-pointer flex-col items-center disabled:cursor-default"
          aria-label={t("你個城")}
          data-testid="raise"
        >
          <img
            src="/art/ui/crane.webp"
            alt=""
            draggable={false}
            className={cn(
              "size-20 object-contain drop-shadow-[0_3px_2px_rgba(0,0,0,0.45)] active:scale-90",
              buildable && "animate-[icon-glow_1.8s_ease-in-out_infinite]",
            )}
          />
          {buildable && !pending?.running && state.levels.every((level) => level === 0) ? (
            <TipHand className="-top-11 left-1/2 -translate-x-1/2" />
          ) : null}
          {buildCost === null ? null : (
            <span
              className={cn(
                "-mt-2 rounded-full bg-white px-2 text-xs font-black tabular-nums text-[#1E3A8A] shadow",
                !buildable && "opacity-60",
              )}
            >
              <img src="/art/ui/coin.webp" alt="" className="mr-0.5 inline size-4 align-[-3px]" />
              {buildCost}
            </span>
          )}
        </button>

        <div className="relative flex min-h-14 flex-col items-center justify-end gap-1">
          {/* GO is carved into the middle stone now (tap it); this button is for keyboards and screen readers. */}
          <button
            type="button"
            onClick={onWalk}
            disabled={state.dice < 1 || pending?.running === true}
            className="sr-only"
            aria-label={t("擲骰")}
            data-testid="roll-move"
          >
            GO
          </button>
        </div>
      </footer>

      {intro ? <AttackIntro rivalFace={state.rivalFace} /> : null}

      {/* Settings sheet. */}
      {menuOpen ? (
        <div className="absolute inset-0 z-40 flex items-end bg-[#1E3A8A]/60" onClick={() => setMenuOpen(false)}>
          <div
            className="w-full space-y-3 rounded-t-[32px] bg-[#FFFFFF] p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            data-testid="menu-sheet"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">{t("設定")}</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#EAF4FF] text-xl"
                  onClick={() => {
                    setMuted(!mute);
                    setMute(!mute);
                  }}
                  aria-label={mute ? t("開聲") : t("靜音")}
                  data-testid="mute"
                >
                  {mute ? "🔇" : "🔊"}
                </button>
                <button type="button" className="cursor-pointer text-2xl" onClick={() => setMenuOpen(false)} aria-label={t("關閉")}>
                  ✕
                </button>
              </div>
            </div>
            <LangPicker />
            <div className="grid grid-cols-4 gap-2" data-testid="daily-character-pick">
              {CHARACTERS.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    if (pending?.running) return;
                    setPick(i);
                    savePick(i);
                  }}
                  aria-pressed={pick === i}
                  className={cn(
                    "flex cursor-pointer flex-col items-center rounded-2xl border-[3px] p-1 transition",
                    pick === i ? "border-[#FBD000] bg-[#FFF8D6] shadow" : "border-transparent opacity-70",
                  )}
                  data-testid={`daily-character-${i}`}
                >
                  <img src={c.avatar} alt="" className="size-11 rounded-full border-2 object-cover" style={{ borderColor: c.colour }} />
                  <span className="mt-0.5 text-xs font-black text-[#1E3A8A]">{t(c.name)}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-bold text-[#1E3A8A]">
              <span key={power} className="rounded-full bg-[#EAF4FF] px-3 py-1 tabular-nums animate-[bump_0.35s_ease-out]" data-testid="attack-power">
                ⚔️ {power}
              </span>
              {holdsNft(state) ? (
                <span className="rounded-full bg-[#E8F7E8] px-3 py-1 text-[#2E8B3E]" data-testid="dst-today">
                  DST {state.dstTakenToday}／{DAILY_DST_CAP}
                </span>
              ) : null}
            </div>
            <NftSlots
              nfts={state.nfts}
              onPlace={(slot, id) => dispatch({ type: "place-nft", slot, id })}
              onRemove={(slot) => dispatch({ type: "remove-nft", slot })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-11 cursor-pointer"
                variant="outline"
                onClick={() => dispatch({ type: "add-test-die" })}
                data-testid="test-die"
              >
                {t("補一粒（測試）")}
              </Button>
              <Button
                className="h-11 cursor-pointer"
                variant="outline"
                onClick={onRaided}
                disabled={weapon === 0}
                data-testid="raided"
              >
                {t("被攻擊（測試）")}
              </Button>
              <Button
                className="h-11 cursor-pointer"
                variant="outline"
                onClick={() => dispatch({ type: "set-rival-nft", value: !state.rivalHasNft })}
                data-testid="rival-nft"
              >
                {t("對手 NFT：{v}（測試）", { v: t(state.rivalHasNft ? "有" : "冇") })}
              </Button>
              <Button className="h-11 cursor-pointer" variant="outline" onClick={resetBoard}>
                {resetArmed ? t("確定重開？") : t("重開棋盤")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
