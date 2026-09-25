"use client";

import { useEffect, useState } from "react";

const LOAD_MS = 1400;

/** Opening screen: the title art full-bleed, a loading bar, then a tap to start. */
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
      className="relative flex h-dvh w-full flex-col items-center justify-end overflow-hidden bg-[#1E3A8A] bg-cover bg-center"
      style={{ backgroundImage: "url(/art/title.jpg)" }}
      data-testid="title-screen"
    >
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#1E3A8A]/70 to-transparent" />
      <h1
        className="absolute top-[max(env(safe-area-inset-top),2.5rem)] text-6xl font-black tracking-wider text-[#FBD000]"
        style={{ WebkitTextStroke: "3px #1E3A8A", textShadow: "0 6px 0 #E52521, 0 10px 18px rgba(30,58,138,0.6)" }}
      >
        大富翁
      </h1>
      <div className="relative z-10 mb-[max(env(safe-area-inset-bottom),2rem)] flex w-full max-w-sm flex-col items-center gap-4 px-8">
        {ready ? (
          <button
            type="button"
            onClick={onStart}
            className="h-16 w-full animate-pulse cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#E52521] text-2xl font-black tracking-widest text-[#FFFFFF] shadow-[0_6px_0_#1E3A8A,0_12px_24px_rgba(30,58,138,0.5)] active:translate-y-1 active:shadow-[0_2px_0_#1E3A8A]"
            data-testid="start"
          >
            開始遊戲
          </button>
        ) : (
          <div className="h-6 w-full overflow-hidden rounded-full border-2 border-[#FBD000] bg-[#1E3A8A]/80">
            <div
              className="flex h-full items-center justify-end rounded-full bg-gradient-to-r from-[#049CD8] to-[#FBD000] pr-2 text-xs font-bold text-[#1E3A8A]"
              style={{ width: `${Math.max(12, progress * 100)}%` }}
            >
              {Math.round(progress * 100)}%
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
