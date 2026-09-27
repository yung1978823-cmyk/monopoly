"use client";

import { createDailyScene, type DailyScene } from "@/components/daily-scene";
import { loadThree } from "@/components/eight-scene";
import { TILES } from "@/lib/board";
import { useLang } from "@/lib/i18n";
import { useEffect, useRef } from "react";

export type DailyFloat = { key: number; text: string; colour?: string };

/** The floating-island daily board: a full-screen 3D view with the spaceship. */
export function DailyBoard({
  position,
  stopIndex,
  float,
  recentreKey,
  ready,
  onGo,
  dice,
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
}) {
  const box = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DailyScene | null>(null);
  const { t } = useLang();
  const startRef = useRef(position);
  const labelsRef = useRef(TILES.map((tile) => t(tile.name)));
  const latest = useRef({ position, stopIndex, ready, onGo });
  latest.current = { position, stopIndex, ready, onGo };

  useEffect(() => {
    let dead = false;
    loadThree()
      .then((T) => {
        if (dead || !box.current) return;
        const scene = createDailyScene(T, box.current, labelsRef.current, startRef.current, () => latest.current.onGo());
        sceneRef.current = scene;
        scene.moveTo(latest.current.position);
        scene.highlight(latest.current.stopIndex);
        scene.setReady(latest.current.ready);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.moveTo(position);
  }, [position]);
  useEffect(() => {
    sceneRef.current?.highlight(stopIndex);
  }, [stopIndex]);
  useEffect(() => {
    sceneRef.current?.setReady(ready);
  }, [ready]);
  const diceKey = dice?.key ?? null;
  const diceRef = useRef(dice);
  diceRef.current = dice;
  useEffect(() => {
    const roll = diceRef.current;
    if (roll) sceneRef.current?.throwDice(roll.faces);
    else sceneRef.current?.clearDice();
  }, [diceKey]);
  useEffect(() => {
    if (float) sceneRef.current?.floatText(float.text, float.colour);
    // Only a new key floats new words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [float?.key]);
  useEffect(() => {
    if (recentreKey > 0) sceneRef.current?.recentre();
  }, [recentreKey]);

  return <div ref={box} className="absolute inset-0" data-testid="daily-board" />;
}
