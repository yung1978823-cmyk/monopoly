"use client";

import { createCityScene, type CityScene, type MonsterLook } from "@/components/city-scene";
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
  resident = null,
  attacker = null,
  lunge = null,
  lungeKey = 0,
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
  /** The monster living in this town's middle, and your monster hovering in to attack (remount to change). */
  resident?: MonsterLook | null;
  attacker?: MonsterLook | null;
  /** A new `lungeKey` sends the attacker swooping at building `lunge`. */
  lunge?: number | null;
  lungeKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const latest = useRef({ theme, levels, targets, onPick, resident, attacker });
  latest.current = { theme, levels, targets, onPick, resident, attacker };

  useEffect(() => {
    let dead = false;
    loadThree()
      .then((T) => {
        if (dead || !box.current) return;
        const now = latest.current;
        const scene = createCityScene(T, box.current, now.theme, now.levels, (i) => latest.current.onPick?.(i), {
          resident: now.resident,
          attacker: now.attacker,
        });
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
    if (lungeKey > 0 && lunge !== null) sceneRef.current?.lunge(lunge);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lungeKey]);
  useEffect(() => {
    if (celebrateKey > 0) sceneRef.current?.celebrate();
  }, [celebrateKey]);
  useEffect(() => {
    sceneRef.current?.setTargets(targets);
  }, [targets]);

  return <div ref={box} className="absolute inset-0" data-testid="city-view" />;
}
