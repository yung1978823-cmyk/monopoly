"use client";

import { BoolionaireLogo } from "@/components/boolionaire-logo";
import { useEffect, useState } from "react";

const LOAD_MS = 1400;

/** Swap in the drawn logo here once it exists (e.g. "/art/logo.png"); until then a type logo stands in. */
const LOGO_ART: string | null = null;

/** Opening screen: the title art shown whole, the logo, a slim loading bar, then a tap to start. */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const next = Math.min(1, (time - started) / LOAD_MS);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const ready = progress >= 1;

  return (
    <main
      className="relative flex h-dvh w-full flex-col items-center overflow-hidden bg-[#1E3A8A] [container-type:size]"
      data-testid="title-screen"
    >
      {/* Blurred copy fills the screen behind; the sharp art is shown whole so no face is cut off. */}
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl brightness-90"
        style={{ backgroundImage: "url(/art/title.jpg)" }}
        aria-hidden="true"
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-[breathe_6s_ease-in-out_infinite] bg-contain bg-center bg-no-repeat"
        style={{
          backgroundImage: "url(/art/title.jpg)",
          width: "min(100cqw, calc(100cqh * 941 / 1672))",
          aspectRatio: "941 / 1672",
          maskImage: "linear-gradient(transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(transparent, black 10%, black 90%, transparent)",
        }}
        role="img"
        aria-label="吸血鬼、中國殭屍、木乃伊同殭屍喺大棋盤上衝出嚟"
      />
      <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-[#0f2a6b]/80 via-[#0f2a6b]/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[35%] bg-gradient-to-t from-[#0f2a6b]/85 via-[#0f2a6b]/35 to-transparent" />

      {/* Logo. */}
      <header className="relative z-10 mt-[max(env(safe-area-inset-top),2.25rem)] flex flex-col items-center">
        {LOGO_ART ? (
          <div
            className="h-[22cqh] w-[88cqw] bg-contain bg-center bg-no-repeat drop-shadow-[0_8px_16px_rgba(15,42,107,0.5)]"
            style={{ backgroundImage: `url(${LOGO_ART})` }}
            role="img"
            aria-label="Boolionaire"
          />
        ) : (
          <BoolionaireLogo className="text-[min(13.5cqw,4.2rem)]" />
        )}
        <span className="mt-2 rounded-full bg-white/15 px-3 py-0.5 text-xs font-bold tracking-[0.3em] text-white/90 backdrop-blur-sm">
          大富翁
        </span>
      </header>

      {/* Start. */}
      <footer className="relative z-10 mt-auto mb-[max(env(safe-area-inset-bottom),2.25rem)] flex w-full max-w-xs flex-col items-center gap-3 px-10">
        {ready ? (
          <button
            type="button"
            onClick={onStart}
            className="relative h-14 w-full cursor-pointer animate-[bob_2.4s_ease-in-out_infinite] overflow-hidden rounded-full bg-gradient-to-b from-[#FF5A4E] to-[#D91F1A] font-display text-xl font-extrabold tracking-wider text-white shadow-[0_5px_0_#9E1512,0_12px_24px_rgba(15,42,107,0.45)] transition-transform active:translate-y-1 active:shadow-[0_1px_0_#9E1512]"
            data-testid="start"
          >
            <span className="absolute inset-x-3 top-1 h-[42%] rounded-full bg-white/30" aria-hidden="true" />
            <span className="relative">開始遊戲</span>
          </button>
        ) : (
          <>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/25 ring-1 ring-white/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FBD000] to-[#FFE866]"
                style={{ width: `${Math.max(6, progress * 100)}%` }}
              />
            </div>
            <p className="text-xs font-bold tracking-widest text-white/80">載入中 {Math.round(progress * 100)}%</p>
          </>
        )}
      </footer>
    </main>
  );
}
