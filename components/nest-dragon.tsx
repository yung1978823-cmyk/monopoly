"use client";

import { loadThree } from "@/components/eight-scene";
import { MODEL_CLOSE_UP, buildMonster } from "@/components/monster";
import { useEffect, useRef } from "react";

/**
 * 龍巢 (Sky 2026-10-09): the player's own 3D dragon lying in the nest on their island — no stone, no background,
 * seen from the same high angle as the painted island, breathing and looking about.
 */
export function NestDragon({ element, stage }: { element: number; stage: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    let stop = () => undefined as void;
    loadThree()
      .then((T) => {
        const host = box.current;
        if (dead || !host) return;
        const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputEncoding = T.sRGBEncoding;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.domElement.style.display = "block";
        renderer.domElement.style.pointerEvents = "none";
        host.appendChild(renderer.domElement);
        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(30, 1, 0.1, 50);
        scene.add(new T.HemisphereLight(0xfff4e0, 0x403020, 1.0));
        const sun = new T.DirectionalLight(0xfff2dc, 1.1);
        sun.position.set(-2, 5, 4);
        scene.add(sun);
        const monster = buildMonster(T, element, stage);
        monster.setMood("rest");
        monster.group.scale.setScalar(monster.model ? MODEL_CLOSE_UP : 1);
        monster.group.rotation.y = 0.5;
        scene.add(monster.group);
        const tall = monster.height * (monster.model ? MODEL_CLOSE_UP : 1);
        // 50° down, like the island picture; the dragon's feet sit at the bottom middle of the box.
        const elev = (50 * Math.PI) / 180, dist = 5.6;
        const lookY = tall * 0.35;
        camera.position.set(0, lookY + Math.sin(elev) * dist, Math.cos(elev) * dist);
        camera.lookAt(0, lookY, 0);
        const fit = () => {
          const w = host.clientWidth || 200, h = host.clientHeight || 200;
          renderer.setSize(w, h, false);
          renderer.domElement.style.width = `${w}px`;
          renderer.domElement.style.height = `${h}px`;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        const watch = new ResizeObserver(fit);
        watch.observe(host);
        fit();
        let frame = 0;
        const tick = (now: number) => {
          monster.group.rotation.y = 0.5 + Math.sin(now / 4000) * 0.35;
          monster.update(now);
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        stop = () => {
          cancelAnimationFrame(frame);
          watch.disconnect();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      stop();
    };
  }, [element, stage]);
  return <div ref={box} className="pointer-events-none h-full w-full" data-testid="nest-dragon" />;
}
