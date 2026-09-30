"use client";

/** How long the 偷嘢 intro runs before the rival's store opens (the smoke has covered the screen by then). */
export const STEAL_INTRO_MS = 2600;

/** Grey smoke puffs that fill the screen (x, y in %, size in vmin). */
const SMOKE: [number, number, number][] = [
  [50, 50, 70], [25, 30, 60], [75, 28, 62], [20, 70, 64], [80, 72, 62], [50, 15, 58], [50, 88, 60], [8, 48, 56], [92, 50, 56],
];

/** A cloud of smoke: "in" puffs it up to cover the screen, "out" clears it away. */
export function SmokeCloud({ mode, delay = 0 }: { mode: "in" | "out"; delay?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {SMOKE.map(([x, y, s], i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${s * 1.4}vmin`,
            height: `${s * 1.4}vmin`,
            marginLeft: `-${s * 0.7}vmin`,
            marginTop: `-${s * 0.7}vmin`,
            background: "radial-gradient(circle at 45% 40%, #d9dde6 0%, #b9bfcc 45%, rgba(150,158,176,0.9) 60%, rgba(150,158,176,0) 72%)",
            animation: `${mode === "in" ? "smoke-in" : "smoke-out"} ${mode === "in" ? 600 : 800}ms ease-out ${delay + i * 25}ms both`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Landing on 偷嘢 (Sky 2026-09-30): night falls over the board, a searchlight sweeps, paw prints tiptoe across,
 * the masked raccoon sneaks in with his sack, stops and winks, then leaps — puff! — into a cloud of smoke,
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
      {/* Paw prints tiptoeing across. */}
      <div className="absolute inset-x-0 top-[70%]">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="absolute size-5 rounded-full bg-[#3b2a1f]/80 opacity-0"
            style={{
              left: `${6 + i * 12}%`,
              top: i % 2 ? "0" : "22px",
              transform: "scaleX(0.8)",
              animation: `paw-print 1400ms ease-out ${300 + i * 110}ms both`,
              boxShadow: "-9px -12px 0 -5px rgba(59,42,31,0.8), 0 -15px 0 -5px rgba(59,42,31,0.8), 9px -12px 0 -5px rgba(59,42,31,0.8)",
            }}
          />
        ))}
      </div>
      {/* The raccoon thief sneaks in, stops, winks, and leaps into the smoke. */}
      <div className="absolute left-1/2 top-[56%] animate-[thief-sneak_2600ms_both]">
        <img src="/art/fx/thief.webp" alt="" draggable={false} className="size-[62vmin] max-h-80 max-w-80 object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]" />
      </div>
      {/* Puff! */}
      <SmokeCloud mode="in" delay={1850} />
    </div>
  );
}
