"use client";
import type { CSSProperties } from "react";

/** How long the 偷嘢 intro runs before the rival's store opens (the smoke has covered the screen by then). */
export const STEAL_INTRO_MS = 2600;

/**
 * Soft smoke (Sky 2026-10-01: "唔好咁實色"): see-through, billowy puffs (three noise-drawn cloud pictures)
 * that swirl open from the middle outwards over a light haze. Each: x, y in %, size in vmin, turn, ring.
 */
const SMOKE: [number, number, number, number, number][] = [
  [55, 50, 64, 77, 0],
  [47, 56, 66, 333, 0],
  [47, 44, 55, 37, 0],
  [71, 66, 65, 187, 1],
  [54, 82, 63, 259, 1],
  [34, 74, 68, 19, 1],
  [27, 48, 64, 222, 1],
  [36, 24, 75, 35, 1],
  [56, 19, 69, 46, 1],
  [72, 37, 75, 30, 1],
  [72, 98, 73, 114, 2],
  [45, 107, 71, 295, 2],
  [20, 89, 82, 25, 2],
  [9, 53, 77, 23, 2],
  [17, 15, 74, 148, 2],
  [41, -6, 83, 73, 2],
  [69, -1, 73, 292, 2],
  [88, 28, 79, 286, 2],
  [90, 67, 75, 52, 2],
];

/** A cloud of smoke: "in" billows it up to cover the screen, "out" lets it drift apart and fade. */
export function SmokeCloud({ mode, delay = 0 }: { mode: "in" | "out"; delay?: number }) {
  const inn = mode === "in";
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(226,222,240,0.92), rgba(190,184,214,0.85) 60%, rgba(150,142,184,0.8))",
          animation: `${inn ? "smoke-haze-in" : "smoke-haze-out"} ${inn ? 700 : 900}ms ease-out ${delay + (inn ? 120 : 100)}ms both`,
        }}
      />
      {SMOKE.map(([x, y, s, turn, ring], i) => {
        const a = Math.atan2(y - 50, x - 50);
        return (
          <img
            key={i}
            src={`/art/fx/smoke${(i % 3) + 1}.webp`}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                width: `${s * 1.5}vmin`,
                height: `${s * 1.5}vmin`,
                "--r": `${turn}deg`,
                "--dx": `${Math.cos(a) * (ring ? 8 : 3)}vmin`,
                "--dy": `${Math.sin(a) * (ring ? 8 : 3)}vmin`,
                animation: `${inn ? "smoke-in" : "smoke-out"} ${inn ? 650 : 950}ms ease-out ${delay + (inn ? ring * 90 : (2 - ring) * 60) + (i % 3) * 20}ms both`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/**
 * Landing on 偷嘢 (Sky 2026-10-01: the thief is now her masked ghost): night falls, a searchlight sweeps, the
 * ghost flickers into being and floats in with its sack, giggles, then spins away — poof! — into soft smoke,
 * and the rival's store opens behind it (the steal screen clears the smoke).
 */
export function StealIntro() {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden" data-testid="steal-intro">
      {/* Night falls. */}
      <div className="absolute inset-0 animate-[night-fall_2600ms_ease-out_both] bg-[#070b22]" />
      {/* A searchlight sweeping from the top. */}
      <div
        className="absolute left-1/2 top-[-10%] h-[120%] w-[70vmin] origin-top animate-[searchlight_2600ms_ease-in-out_both] opacity-0"
        style={{ background: "linear-gradient(to bottom, rgba(255,246,190,0.75), rgba(255,246,190,0.12) 80%, transparent)", clipPath: "polygon(45% 0, 55% 0, 100% 100%, 0 100%)" }}
      />
      {/* Little purple wisps the ghost leaves behind. */}
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className="absolute size-[3vmin] rounded-full opacity-0"
          style={{
            left: `${8 + i * 8}%`,
            top: `${54 + (i % 2 ? 4 : -2)}%`,
            background: "radial-gradient(circle, rgba(255,255,255,0.95), rgba(196,140,255,0.6) 45%, transparent 70%)",
            animation: `ghost-wisp 900ms ease-out ${350 + i * 150}ms both`,
          }}
        />
      ))}
      {/* The ghost flickers in, floats to the middle, giggles, and spins away into the smoke. */}
      <div className="absolute left-1/2 top-[54%] animate-[ghost-float_2600ms_both]">
        <img src="/art/fx/thief.webp" alt="" draggable={false} className="size-[62vmin] max-h-80 max-w-80 object-contain drop-shadow-[0_0_22px_rgba(190,130,255,0.65)]" />
      </div>
      {/* Poof! */}
      <SmokeCloud mode="in" delay={1850} />
    </div>
  );
}
