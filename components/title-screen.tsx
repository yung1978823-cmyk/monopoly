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
      className="relative flex h-dvh w-full flex-col items-center justify-end overflow-hidden bg-[#411314] bg-cover bg-center"
      style={{ backgroundImage: "url(/art/title.jpg)" }}
      data-testid="title-screen"
    >
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#411314]/70 to-transparent" />
      <h1
        className="absolute top-[max(env(safe-area-inset-top),2.5rem)] text-6xl font-black tracking-wider text-[#fee0ba]"
        style={{ WebkitTextStroke: "3px #411314", textShadow: "0 6px 0 #c73331, 0 10px 18px rgba(65,19,20,0.6)" }}
      >
        大富翁
      </h1>
      <div className="relative z-10 mb-[max(env(safe-area-inset-bottom),2rem)] flex w-full max-w-sm flex-col items-center gap-4 px-8">
        {ready ? (
          <button
            type="button"
            onClick={onStart}
            className="h-16 w-full animate-pulse cursor-pointer rounded-full border-4 border-[#f2b53a] bg-[#c73331] text-2xl font-black tracking-widest text-[#fee0ba] shadow-[0_6px_0_#411314,0_12px_24px_rgba(65,19,20,0.5)] active:translate-y-1 active:shadow-[0_2px_0_#411314]"
            data-testid="start"
          >
            開始遊戲
          </button>
        ) : (
          <div className="h-6 w-full overflow-hidden rounded-full border-2 border-[#f2b53a] bg-[#411314]/80">
            <div
              className="flex h-full items-center justify-end rounded-full bg-gradient-to-r from-[#f5865b] to-[#f2b53a] pr-2 text-xs font-bold text-[#411314]"
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
