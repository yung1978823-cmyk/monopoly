"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * 手感三級 (Sky 2026-10-01, from the game-feel skill): every satisfying moment in the game fires one of three
 * feedback bundles, so small things stay small and big things feel big, the same way everywhere.
 * - small: coins, a tap — a few sparkles at the spot.
 * - medium: buying land, building, good loot, a chest — sparkles, a soft glow and a light screen nudge.
 * - large: explosions, a jackpot, a landmark — a white flash, a strong shake and a burst of sparkles.
 * Screens call `juice(tier, x, y)`; one layer (mounted once) draws it. Reduce-motion turns shakes and flashes off.
 */
export type Tier = "small" | "medium" | "large";

type Burst = { id: number; tier: Tier; x: number; y: number; colour: string };

const EVENT = "boolionaire-juice";

/** Fire a feedback bundle at a point on screen (defaults to the middle). */
export function juice(tier: Tier, x?: number, y?: number, colour = "#FFD84D") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { tier, x: x ?? window.innerWidth / 2, y: y ?? window.innerHeight / 2, colour } }),
  );
}

/** Fire a bundle at the middle of an element (a button, a crate). */
export function juiceAt(tier: Tier, element: Element | null, colour?: string) {
  if (!element) return juice(tier, undefined, undefined, colour);
  const box = element.getBoundingClientRect();
  juice(tier, box.left + box.width / 2, box.top + box.height / 2, colour);
}

/** Players who asked for less motion get no shake and no flash (the sparkles stay, gently). */
function calm(): boolean {
  try {
    if (localStorage.getItem("boolionaire-reduce-motion") === "1") return true;
  } catch {
    // No storage: fall back to the system setting.
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const COUNT: Record<Tier, number> = { small: 6, medium: 12, large: 22 };
const REACH: Record<Tier, number> = { small: 38, medium: 70, large: 130 };
const LIFE: Record<Tier, number> = { small: 550, medium: 800, large: 1100 };

export function JuiceLayer() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    let next = 1;
    const onJuice = (event: Event) => {
      const { tier, x, y, colour } = (event as CustomEvent).detail as Omit<Burst, "id">;
      const id = next++;
      setBursts((all) => [...all.slice(-8), { id, tier, x, y, colour }]);
      window.setTimeout(() => setBursts((all) => all.filter((b) => b.id !== id)), LIFE[tier] + 50);
      if (calm()) return;
      // Shake the whole game for medium and large (the trauma idea: bigger event, bigger shake, always settles).
      if (tier !== "small") {
        const root = document.body;
        const cls = tier === "large" ? "juice-shake-large" : "juice-shake-medium";
        root.classList.remove("juice-shake-large", "juice-shake-medium");
        void root.offsetWidth;
        root.classList.add(cls);
        window.setTimeout(() => root.classList.remove(cls), tier === "large" ? 520 : 320);
      }
      if (tier === "large") setFlash(id);
    };
    window.addEventListener(EVENT, onJuice);
    return () => window.removeEventListener(EVENT, onJuice);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden="true">
      {flash ? <div key={flash} className="absolute inset-0 bg-white animate-[juice-flash_260ms_ease-out_forwards]" /> : null}
      {bursts.map((b) => (
        <div key={b.id} className="absolute" style={{ left: b.x, top: b.y }}>
          {b.tier !== "small" ? (
            <span
              className="absolute size-24 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[juice-ring_700ms_ease-out_forwards]"
              style={{ boxShadow: `0 0 0 4px ${b.colour}`, background: `radial-gradient(circle, ${b.colour}66, transparent 65%)` }}
            />
          ) : null}
          {Array.from({ length: COUNT[b.tier] }, (_, k) => {
            const a = (k / COUNT[b.tier]) * Math.PI * 2 + (b.id % 7) * 0.4;
            const r = REACH[b.tier] * (0.6 + ((k * 37) % 10) / 25);
            const style = {
              "--jx": `${Math.cos(a) * r}px`,
              "--jy": `${Math.sin(a) * r - 10}px`,
              background: k % 3 === 0 ? "#ffffff" : b.colour,
              boxShadow: `0 0 6px ${b.colour}`,
              animationDuration: `${LIFE[b.tier]}ms`,
            } as CSSProperties;
            return <span key={k} className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] animate-[juice-spark_ease-out_forwards]" style={style} />;
          })}
        </div>
      ))}
    </div>
  );
}
