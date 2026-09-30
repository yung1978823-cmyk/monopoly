"use client";

import { createDailyScene, type DailyScene, type PetLook } from "@/components/daily-scene";
import { loadThree } from "@/components/eight-scene";
import { TILES } from "@/lib/board";
import { useLang } from "@/lib/i18n";
import { useEffect, useRef } from "react";

export type DailyFloat = { key: number; text: string; colour?: string; cheer?: boolean };

/** The floating-island daily board: a full-screen 3D view with the spaceship. */
export function DailyBoard({
  position,
  stopIndex,
  float,
  recentreKey,
  ready,
  onGo,
  dice,
  actor,
  pet = null,
  onEggTap,
  blown,
}: {
  position: number;
  stopIndex: number | null;
  float: DailyFloat | null;
  recentreKey: number;
  /** Your go and dice left: the GO rune glows and a tap on the stone rolls. */
  ready: boolean;
  onGo: () => void;
  /** The roll to throw onto the middle stone (a new key throws again); null clears the dice. */
  dice: { key: number; faces: [number, number] } | null;
  /** Your 3D character (a key of ACTORS). Remount the board (change its key) to swap it. */
  actor?: string;
  /** Your dragon on the middle stone. */
  pet?: PetLook | null;
  onEggTap?: () => void;
  /** The next move is the 龍捲風 carrying you (not a walk). */
  blown?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DailyScene | null>(null);
  const { t } = useLang();
  const startRef = useRef(position);
  const labelsRef = useRef(TILES.map((tile) => t(tile.name)));
  const latest = useRef({ position, stopIndex, ready, onGo, actor, pet, onEggTap });
  latest.current = { position, stopIndex, ready, onGo, actor, pet, onEggTap };

  useEffect(() => {
    let dead = false;
    loadThree()
      .then((T) => {
        if (dead || !box.current) return;
        const scene = createDailyScene(T, box.current, labelsRef.current, startRef.current, () => latest.current.onGo(), latest.current.actor);
        sceneRef.current = scene;
        scene.moveTo(latest.current.position);
        scene.highlight(latest.current.stopIndex);
        scene.setReady(latest.current.ready);
        scene.setPet(latest.current.pet);
        scene.onEggTap(() => latest.current.onEggTap?.());
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const blownRef = useRef(false);
  blownRef.current = blown === true;
  useEffect(() => {
    if (blownRef.current) sceneRef.current?.blowTo(position);
    else sceneRef.current?.moveTo(position);
  }, [position]);
  useEffect(() => {
    sceneRef.current?.highlight(stopIndex);
  }, [stopIndex]);
  useEffect(() => {
    sceneRef.current?.setReady(ready);
  }, [ready]);
  const petKey = pet ? `${pet.element}-${pet.stage}-${pet.legend}-${pet.hungry}-${pet.rolls ?? ""}` : "";
  useEffect(() => {
    sceneRef.current?.setPet(latest.current.pet);
  }, [petKey]);
  const diceKey = dice?.key ?? null;
  const diceRef = useRef(dice);
  diceRef.current = dice;
  useEffect(() => {
    const roll = diceRef.current;
    if (roll) sceneRef.current?.throwDice(roll.faces);
    else sceneRef.current?.clearDice();
  }, [diceKey]);
  useEffect(() => {
    // No words over the hero any more (Sky): the big picture in the middle of the screen says what you got.
    if (float?.text) sceneRef.current?.floatText(float.text, float.colour);
    if (float?.cheer) {
      sceneRef.current?.cheer();
      sceneRef.current?.petHappy();
    }
    // Only a new key floats new words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [float?.key]);
  useEffect(() => {
    if (recentreKey > 0) sceneRef.current?.recentre();
  }, [recentreKey]);

  return <div ref={box} className="absolute inset-0" data-testid="daily-board" />;
}
