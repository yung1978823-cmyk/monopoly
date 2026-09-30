"use client";

import { CHARACTERS } from "@/lib/characters";

/** How long the 突襲 intro runs before the rival's island opens (the clouds have closed by then). */
export const ATTACK_INTRO_MS = 2300;

/** Soft white cloud puffs for the cloud wall (x, y in %, size in vmin). */
const PUFFS: [number, number, number][] = [
  [-1, -3, 46], [13, 0, 41], [28, 0, 35], [47, -3, 36], [-1, 15, 36], [14, 14, 51], [33, 12, 52], [44, 15, 39], [-3, 22, 40], [19, 22, 44], [33, 24, 44], [45, 21, 38], [1, 37, 40], [17, 37, 39], [34, 39, 38], [49, 38, 50], [2, 48, 52], [13, 49, 48], [29, 50, 35], [49, 52, 44], [3, 61, 47], [17, 63, 42], [35, 66, 43], [49, 59, 47], [1, 79, 49], [14, 74, 46], [28, 75, 37], [45, 71, 48], [-3, 85, 41], [19, 84, 42], [32, 91, 49], [51, 86, 41], [-1, 103, 51], [13, 97, 38], [30, 100, 45], [46, 96, 42],
];

/** Pale mist colours for the cloud wall. */
const MIST = ["rgba(255,255,255,0.8)", "rgba(255,226,246,0.8)", "rgba(228,222,255,0.8)", "rgba(220,238,255,0.8)"];

/** A wall of clouds: `side` sweeps in from the left or right. `mode` "in" closes it, "out" opens it. */
export function CloudWall({ side, mode, delay = 0 }: { side: "left" | "right"; mode: "in" | "out"; delay?: number }) {
  return (
    <div
      className="pointer-events-none absolute -inset-y-[10%] w-[66%]"
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
            // Dreamy mist (Sky 2026-09-30: not so solid): see-through, blurred, with pale pink and lilac tints.
            background: `radial-gradient(circle at 45% 40%, ${MIST[i % MIST.length]} 0%, ${MIST[i % MIST.length].replace("0.8)", "0.45)")} 45%, rgba(255,255,255,0) 70%)`,
            filter: "blur(6px)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Landing on 攻擊 (Sky 2026-09-30: a surprise, not a flat pop-up): the board shakes under red siren light, a target
 * lock closes on the rival's face, a soft flash, then a dreamy wall of mist
 * closes over everything — and the rival's island opens behind the clouds (the attack screen parts them).
 */
export function AttackIntro({ rivalFace }: { rivalFace: number }) {
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

      {/* A soft flash as the lock fires. */}
      <div className="absolute inset-0 animate-[white-flash_2300ms_both] bg-white opacity-0" />

      {/* The cloud wall closes. */}
      <CloudWall side="left" mode="in" delay={1600} />
      <CloudWall side="right" mode="in" delay={1600} />
    </div>
  );
}
