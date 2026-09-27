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
}: {
  position: number;
  stopIndex: number | null;
  float: DailyFloat | null;
  recentreKey: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DailyScene | null>(null);
  const { t } = useLang();
  const startRef = useRef(position);
  const labelsRef = useRef(TILES.map((tile) => t(tile.name)));
  const latest = useRef({ position, stopIndex });
  latest.current = { position, stopIndex };

  useEffect(() => {
    let dead = false;
    loadThree()
      .then((T) => {
        if (dead || !box.current) return;
        const scene = createDailyScene(T, box.current, labelsRef.current, startRef.current);
        sceneRef.current = scene;
        scene.moveTo(latest.current.position);
        scene.highlight(latest.current.stopIndex);
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
    if (float) sceneRef.current?.floatText(float.text, float.colour);
    // Only a new key floats new words.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [float?.key]);
  useEffect(() => {
    if (recentreKey > 0) sceneRef.current?.recentre();
  }, [recentreKey]);

  return <div ref={box} className="absolute inset-0" data-testid="daily-board" />;
}
