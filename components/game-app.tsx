"use client";

import { JuiceLayer } from "@/components/juice";
import { DailyGame } from "@/components/daily-game";
import { TitleScreen } from "@/components/title-screen";
import { initMusic } from "@/lib/music";
import { useEffect, useState } from "react";

export function GameApp() {
  const [started, setStarted] = useState(false);
  useEffect(() => initMusic(), []);
  // Portrait only (Sky 2026-10-02): where the browser allows it (an installed app on Android), lock it upright.
  useEffect(() => {
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o.lock?.("portrait").catch(() => {});
    } catch {
      // Not allowed here; the sideways cover in the layout does the job.
    }
  }, []);
  return (
    <>
      {started ? <DailyGame /> : <TitleScreen onStart={() => setStarted(true)} />}
      <JuiceLayer />
    </>
  );
}
