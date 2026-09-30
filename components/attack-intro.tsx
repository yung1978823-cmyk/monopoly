"use client";

import { CHARACTERS } from "@/lib/characters";

/** How long the 突襲 intro runs before the rival's island opens (the clouds have closed by then). */
export const ATTACK_INTRO_MS = 2300;

/** Soft white cloud puffs for the cloud wall (x, y in %, size in vmin). */
const PUFFS: [number, number, number][] = [
  [8, 8, 46], [30, 2, 42], [4, 34, 50], [26, 30, 46], [10, 62, 52], [32, 58, 44], [6, 90, 50], [28, 86, 46],
  [48, 16, 36], [46, 48, 40], [50, 78, 38],
];

/** A wall of clouds: `side` sweeps in from the left or right. `mode` "in" closes it, "out" opens it. */
export function CloudWall({ side, mode, delay = 0 }: { side: "left" | "right"; mode: "in" | "out"; delay?: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 w-[62%]"
      style={{
        [side]: 0,
        animation: `${mode === "in" ? "cloud-in" : "cloud-out"}-${side} ${mode === "in" ? 650 : 750}ms ${mode === "in" ? "cubic-bezier(.2,.8,.3,1)" : "cubic-bezier(.6,0,.8,.4)"} ${delay}ms both`,
      }}
    >
      {PUFFS.map(([x, y, s], i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            [side]: `${x}%`,
            top: `${y}%`,
            width: `${s}vmin`,
            height: `${s}vmin`,
            transform: "translate(-30%, -50%)",
            background: "radial-gradient(circle at 40% 35%, #ffffff 0%, #f4f7ff 55%, #dfe7f7 100%)",
            boxShadow: "inset -8px -12px 20px rgba(120,140,190,0.25)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Landing on 攻擊 (Sky 2026-09-30: a surprise, not a flat pop-up): the board shakes under red siren light, a target
 * lock closes on the rival's face, your dragon rockets up past the camera, a white flash, then a wall of clouds
 * closes over everything — and the rival's island opens behind the clouds (the attack screen parts them).
 */
export function AttackIntro({ rivalFace, dragonArt = "/art/ui/pet.webp" }: { rivalFace: number; dragonArt?: string }) {
  const rival = CHARACTERS[rivalFace] ?? CHARACTERS[1];
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden" data-testid="attack-intro">
      {/* Darken, with red siren beams turning round the screen. */}
      <div className="absolute inset-0 animate-[intro-dim_2300ms_ease-out_both] bg-[#12001c]" />
      <div
        className="absolute left-1/2 top-1/2 size-[260vmax] -translate-x-1/2 -translate-y-1/2 animate-[siren_2300ms_linear_both] opacity-0"
        style={{ background: "conic-gradient(from 0deg, rgba(255,40,40,0.55) 0deg, transparent 28deg, transparent 90deg, rgba(255,40,40,0.55) 118deg, transparent 146deg, transparent 180deg, rgba(255,40,40,0.55) 208deg, transparent 236deg, transparent 270deg, rgba(255,40,40,0.55) 298deg, transparent 326deg)" }}
      />
      <div className="absolute inset-0 animate-[edge-pulse_600ms_ease-in-out_3] shadow-[inset_0_0_80px_30px_rgba(255,30,30,0.85)] opacity-0" />

      {/* Target lock on the rival. */}
      <div className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative size-40">
          <img
            src={rival.avatar}
            alt=""
            draggable={false}
            className="absolute inset-4 size-32 rounded-full border-4 border-[#FBD000] object-cover shadow-[0_0_0_4px_#E52521,0_10px_30px_rgba(0,0,0,0.5)] animate-[face-drop_2300ms_both]"
          />
          <svg viewBox="0 0 100 100" className="absolute inset-0 size-40 animate-[lock-on_2300ms_both]" aria-hidden>
            <circle cx="50" cy="50" r="46" fill="none" stroke="#ff3030" strokeWidth="3" strokeDasharray="18 10" />
            <path d="M50 0 V14 M50 86 V100 M0 50 H14 M86 50 H100" stroke="#ff3030" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Your dragon rockets up from below and past the camera, with a fiery trail. */}
      <div className="absolute bottom-0 left-1/2 animate-[dragon-rocket_2300ms_both]">
        <div className="relative">
          <span className="absolute left-1/2 top-[70%] h-[40vh] w-16 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#ffd34d] via-[#ff7a1a]/80 to-transparent blur-md" />
          <img src={dragonArt} alt="" draggable={false} className="relative size-40 object-contain drop-shadow-[0_0_24px_rgba(255,160,40,0.9)]" />
        </div>
      </div>

      {/* White flash as it passes. */}
      <div className="absolute inset-0 animate-[white-flash_2300ms_both] bg-white opacity-0" />

      {/* The cloud wall closes. */}
      <CloudWall side="left" mode="in" delay={1600} />
      <CloudWall side="right" mode="in" delay={1600} />
    </div>
  );
}
