"use client";

import { JuiceLayer } from "@/components/juice";
import { DailyGame } from "@/components/daily-game";
import { TitleScreen } from "@/components/title-screen";
import { useState } from "react";

export function GameApp() {
  const [started, setStarted] = useState(false);
  return (
    <>
      {started ? <DailyGame /> : <TitleScreen onStart={() => setStarted(true)} />}
      <JuiceLayer />
    </>
  );
}
