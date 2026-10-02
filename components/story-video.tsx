"use client";

import { useEffect, useRef, useState } from "react";

import { useLang } from "@/lib/i18n";
import { holdMusic } from "@/lib/music";

const SEEN_KEY = "boolionaire-story-seen";

/** Whether this device has already watched the story once. */
export function storySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * 故事片 (Sky 2026-10-02): the game's 42-second story trailer, full screen. Plays once after the first START,
 * and again from 設定 → 睇故事. Skip at any time; the background music waits until it ends.
 */
export function StoryVideo({ onDone }: { onDone: () => void }) {
  const { t } = useLang();
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Not remembered on this device.
    }
    holdMusic(false);
    onDone();
  };
  useEffect(() => {
    holdMusic(true);
    const v = video.current;
    // Sound needs a tap first; if the browser refuses, play silently with a button to turn the sound on.
    v?.play().catch(() => {
      if (!v) return;
      v.muted = true;
      setMuted(true);
      void v.play().catch(() => undefined);
    });
    return () => holdMusic(false);
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black" data-testid="story-video">
      <video ref={video} src="/video/story.mp4" playsInline preload="auto" onEnded={finish} className="h-full w-full object-contain" />
      {muted ? (
        <button
          type="button"
          onClick={() => {
            if (!video.current) return;
            video.current.muted = false;
            setMuted(false);
          }}
          className="absolute left-4 top-[max(env(safe-area-inset-top),1rem)] flex size-11 cursor-pointer items-center justify-center rounded-full bg-white/20 text-2xl backdrop-blur"
          aria-label={t("開聲")}
        >
          🔇
        </button>
      ) : null}
      <button
        type="button"
        onClick={finish}
        className="absolute right-4 top-[max(env(safe-area-inset-top),1rem)] cursor-pointer rounded-full border-2 border-white/70 bg-black/40 px-4 py-1.5 text-sm font-black text-white backdrop-blur"
        data-testid="story-skip"
      >
        {t("跳過")}
      </button>
    </div>
  );
}
