"use client";
import type { CSSProperties } from "react";

import { ELEMENTS } from "@/lib/pet";

/** How long the hatching show runs. */
export const HATCH_MS = 3400;

/**
 * 孵化 (Sky 2026-10-01): no words, a full-screen moment like the attack and steal intros. The screen dims, a big
 * egg drops in and wobbles harder and harder, cracks appear, a white flash, rays in the dragon's colour spin
 * out and the new dragon (her drawn N picture) pops out with sparkles.
 */
export function HatchIntro({ element }: { element: number }) {
  const colour = ELEMENTS[element]?.colour ?? "#E8B420";
  const id = ELEMENTS[element]?.id ?? "light";
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden" data-testid="hatched">
      <div className="absolute inset-0 bg-[#0b0820] animate-[hatch-dim_3400ms_ease-out_forwards]" />
      {/* Rays in the dragon's colour, spinning out once it hatches. */}
      <div
        className="absolute left-1/2 top-1/2 size-[160vmax] -translate-x-1/2 -translate-y-1/2 animate-[hatch-rays_3400ms_linear_forwards] rounded-full opacity-0"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${colour}cc 0deg 10deg, transparent 10deg 24deg)`,
          maskImage: "radial-gradient(circle, black 8%, transparent 55%)",
          WebkitMaskImage: "radial-gradient(circle, black 8%, transparent 55%)",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 size-[70vmin] -translate-x-1/2 -translate-y-1/2 animate-[hatch-halo_3400ms_ease-out_forwards] rounded-full opacity-0"
        style={{ background: `radial-gradient(circle, ${colour} 0%, ${colour}66 35%, transparent 70%)` }}
      />
      {/* The egg: drops in, wobbles, cracks, bursts. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-[34vmin] w-[26vmin] animate-[hatch-egg_3400ms_ease-in-out_forwards]">
          <div
            className="absolute inset-0 rounded-[50%_50%_46%_46%/60%_60%_40%_40%] shadow-[inset_-1.2vmin_-1.6vmin_0_rgba(0,0,0,0.12),0_0_6vmin_rgba(255,255,255,0.35)]"
            style={{ background: "radial-gradient(circle at 35% 30%, #ffffff, #f3ead8 60%, #e2d4b8)" }}
          />
          {[
            [28, 30],
            [62, 22],
            [48, 55],
            [24, 70],
            [70, 66],
          ].map(([x, y], k) => (
            <span key={k} className="absolute size-[3.2vmin] rounded-full bg-[#E0B23A]" style={{ left: `${x}%`, top: `${y}%` }} />
          ))}
          {/* Cracks, drawn in once the wobbling gets wild. */}
          <svg viewBox="0 0 100 130" className="absolute inset-0 size-full animate-[hatch-crack_3400ms_linear_forwards] opacity-0">
            <path d="M8 62 L22 54 L30 66 L42 50 L52 64 L62 48 L72 62 L82 52 L92 60" fill="none" stroke="#5b4320" strokeWidth="3.2" strokeLinejoin="round" />
            <path d="M42 50 L46 38 L40 30" fill="none" stroke="#5b4320" strokeWidth="2.4" />
          </svg>
        </div>
      </div>
      {/* Bits of shell flying off at the burst. */}
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2;
        return (
          <span
            key={k}
            className="absolute left-1/2 top-1/2 size-[4vmin] rounded-[40%_60%_30%_70%] bg-[#f3ead8] opacity-0 animate-[hatch-shell_3400ms_ease-out_forwards]"
            style={{ "--dx": `${Math.cos(a) * 42}vmin`, "--dy": `${Math.sin(a) * 42}vmin` } as CSSProperties}
          />
        );
      })}
      <div className="absolute inset-0 bg-white opacity-0 animate-[hatch-flash_3400ms_linear_forwards]" />
      {/* The dragon pops out. */}
      <img
        src={`/art/dragons/${id}-1.webp`}
        alt=""
        draggable={false}
        className="absolute left-1/2 top-1/2 w-[62vmin] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-0 animate-[hatch-dragon_3400ms_ease-out_forwards] drop-shadow-[0_2vmin_3vmin_rgba(0,0,0,0.5)]"
      />
      {Array.from({ length: 12 }, (_, k) => (
        <span
          key={k}
          className="absolute size-[2.4vmin] rotate-45 bg-white opacity-0 animate-[hatch-twinkle_3400ms_ease-out_forwards]"
          style={{
            left: `${50 + Math.cos(k * 2.4) * (22 + (k % 3) * 9)}%`,
            top: `${50 + Math.sin(k * 2.4) * (16 + (k % 4) * 6)}%`,
            animationDelay: `${(k % 5) * 70}ms`,
            boxShadow: `0 0 2vmin ${colour}`,
          }}
        />
      ))}
    </div>
  );
}
