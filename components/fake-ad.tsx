"use client";

import { useEffect, useState } from "react";

import { useLang } from "@/lib/i18n";

/** How long the test ad runs before the reward can be claimed (a real rewarded ad is usually 15–30 s). */
export const FAKE_AD_SECONDS = 5;

/**
 * 測試廣告 (Sky 2026-10-08): stands in for a rewarded ad (AdMob, once the game is an app). A full-screen card counts
 * down; after it the reward is given. Closing early gives nothing.
 */
export function FakeAd({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useLang();
  const [left, setLeft] = useState(FAKE_AD_SECONDS);
  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/90 px-6 text-center text-white" data-testid="fake-ad">
      <p className="rounded-full bg-white/15 px-3 py-0.5 text-xs font-black">{t("測試廣告")}</p>
      <p className="mt-6 text-6xl">📺</p>
      <p className="mt-4 text-lg font-black">{t("呢度之後會播真廣告")}</p>
      <p className="mt-2 text-sm font-bold text-white/70">{t("睇完就有獎勵")}</p>
      {left > 0 ? (
        <>
          <p className="mt-6 text-4xl font-black tabular-nums">{left}</p>
          <button type="button" onClick={onCancel} className="mt-6 cursor-pointer text-sm font-bold text-white/60 underline">
            {t("唔睇（冇獎勵）")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onDone}
          className="mt-6 h-14 w-full max-w-xs cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#16A34A] text-xl font-black shadow-[0_5px_0_#166534]"
          data-testid="fake-ad-claim"
        >
          {t("領獎勵")}
        </button>
      )}
    </div>
  );
}
