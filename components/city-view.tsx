"use client";

import { createCityScene, type CityScene } from "@/components/city-scene";
import { loadThree } from "@/components/eight-scene";
import { useEffect, useRef } from "react";

/**
 * A town page in 3D (see city-scene). Change `theme` by remounting (give it a key). A new `popKey`
 * springs building `pop` up; a new `smashKey` knocks building `smash` about; a new `celebrateKey`
 * sets off fireworks.
 */
export function CityView({
  theme,
  levels,
  targets = false,
  onPick,
  pop = null,
  popKey = 0,
  smash = null,
  smashKey = 0,
  celebrateKey = 0,
}: {
  theme: number;
  levels: readonly number[];
  targets?: boolean;
  onPick?: (index: number) => void;
  pop?: number | null;
  popKey?: number;
  smash?: number | null;
  smashKey?: number;
  celebrateKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const latest = useRef({ theme, levels, targets, onPick });
  latest.current = { theme, levels, targets, onPick };

  useEffect(() => {
    let dead = false;
    loadThree()
      .then((T) => {
        if (dead || !box.current) return;
        const now = latest.current;
        const scene = createCityScene(T, box.current, now.theme, now.levels, (i) => latest.current.onPick?.(i));
        scene.setTargets(now.targets);
        sceneRef.current = scene;
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const levelsKey = levels.join(",");
  useEffect(() => {
    sceneRef.current?.setLevels(latest.current.levels);
  }, [levelsKey]);
  useEffect(() => {
    if (popKey > 0 && pop !== null) sceneRef.current?.setLevels(latest.current.levels, pop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popKey]);
  useEffect(() => {
    if (smashKey > 0 && smash !== null) sceneRef.current?.smash(smash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smashKey]);
  useEffect(() => {
    if (celebrateKey > 0) sceneRef.current?.celebrate();
  }, [celebrateKey]);
  useEffect(() => {
    sceneRef.current?.setTargets(targets);
  }, [targets]);

  return <div ref={box} className="absolute inset-0" data-testid="city-view" />;
}
