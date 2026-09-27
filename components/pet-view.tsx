"use client";

import { loadThree } from "@/components/eight-scene";
import { buildMonster } from "@/components/monster";
import { useEffect, useRef } from "react";

/**
 * One monster on a little floating stone, turning slowly; drag to spin it round. Remount (key) to
 * show a different monster or stage.
 */
export function PetView({ element, stage, legend = false }: { element: number; stage: number; legend?: boolean }) {
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
        renderer.shadowMap.enabled = true;
        renderer.domElement.style.display = "block";
        renderer.domElement.style.touchAction = "pan-y";
        host.appendChild(renderer.domElement);
        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(32, 1, 0.1, 50);
        scene.add(new T.HemisphereLight(0xeef4ff, 0x30354a, 0.9));
        const sun = new T.DirectionalLight(0xfff2dc, 1.2);
        sun.position.set(-2, 5, 4);
        sun.castShadow = true;
        scene.add(sun);
        const stone = new T.Mesh(new T.CylinderGeometry(1.1, 0.7, 0.5, 10), new T.MeshStandardMaterial({ color: new T.Color(0x8a8f98).convertSRGBToLinear(), roughness: 0.9, flatShading: true }));
        stone.position.y = -0.25;
        stone.receiveShadow = true;
        const grass = new T.Mesh(new T.CylinderGeometry(1.12, 1.1, 0.1, 10), new T.MeshStandardMaterial({ color: new T.Color(0x6aa84f).convertSRGBToLinear(), roughness: 0.8 }));
        grass.position.y = 0.02;
        grass.receiveShadow = true;
        const turn = new T.Group();
        turn.add(stone, grass);
        const monster = buildMonster(T, element, stage, legend);
        monster.group.scale.setScalar(stage === 0 ? 1.1 : 1.25);
        monster.group.position.y = 0.07;
        turn.add(monster.group);
        scene.add(turn);
        const fit = () => {
          const w = host.clientWidth || 300, h = host.clientHeight || 300;
          renderer.setSize(w, h, false);
          renderer.domElement.style.width = `${w}px`;
          renderer.domElement.style.height = `${h}px`;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        const watch = new ResizeObserver(fit);
        watch.observe(host);
        fit();
        const lookY = monster.height * 0.55;
        camera.position.set(0, lookY + 1.3, 5.2);
        camera.lookAt(0, lookY, 0);
        let spin = 0.4, drag: number | null = null, frame = 0;
        const down = (e: PointerEvent) => (drag = e.clientX);
        const move = (e: PointerEvent) => {
          if (drag === null) return;
          spin += (e.clientX - drag) * 0.01;
          drag = e.clientX;
        };
        const up = () => (drag = null);
        renderer.domElement.addEventListener("pointerdown", down);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        const tick = (now: number) => {
          if (drag === null) spin += 0.004;
          turn.rotation.y = Math.sin(spin) * 0.9;
          turn.position.y = Math.sin(now / 900) * 0.06;
          monster.update(now);
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        stop = () => {
          cancelAnimationFrame(frame);
          watch.disconnect();
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      stop();
    };
  }, [element, stage, legend]);
  return <div ref={box} className="h-full w-full" data-testid="pet-view" />;
}
