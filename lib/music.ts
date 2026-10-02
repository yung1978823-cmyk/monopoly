/**
 * 背景音樂 (Sky 2026-10-01): one looping track (her Suno "Ghostly Board Night", version A, kept in public/music so it never depends on Suno links; the public table plays "Ghostly Showdown" version B), quiet under the
 * sound effects. Browsers only let sound start after a tap, so it waits for the first one; it pauses while the
 * game is in the background. On or off is remembered on this device, and on by default.
 */
const TRACKS = {
  home: "/music/home.mp3",
  table: "/music/table.mp3",
} as const;
export type Track = keyof typeof TRACKS;
let current: Track = "home";
const KEY = "boolionaire-music";
const VOLUME = 0.32;

let player: HTMLAudioElement | null = null;
let ready = false;
/** Held quiet while something else plays its own sound (the story video). */
let held = false;

export function isMusicOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

function sync() {
  if (!player) return;
  if (isMusicOn() && ready && !held && document.visibilityState === "visible") void player.play().catch(() => undefined);
  else player.pause();
}

export function setMusicOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Not remembered on this device.
  }
  sync();
}

/** Quiet the music while the story video plays, and bring it back after. */
export function holdMusic(on: boolean): void {
  held = on;
  if (on) ready = true;
  sync();
}

/** Call once when the game starts: the music begins at the first tap. */
export function initMusic(): void {
  if (typeof window === "undefined" || player) return;
  player = new Audio(TRACKS[current]);
  player.loop = true;
  player.volume = VOLUME;
  player.preload = "auto";
  const first = () => {
    ready = true;
    sync();
    window.removeEventListener("pointerdown", first);
  };
  window.addEventListener("pointerdown", first);
  document.addEventListener("visibilitychange", sync);
}

/** 減少震動同閃光: the screen shakes and white flashes are skipped (see components/juice). */
const CALM_KEY = "boolionaire-reduce-motion";
export function isCalm(): boolean {
  try {
    return localStorage.getItem(CALM_KEY) === "1";
  } catch {
    return false;
  }
}
export function setCalm(on: boolean): void {
  try {
    localStorage.setItem(CALM_KEY, on ? "1" : "0");
  } catch {
    // Not remembered on this device.
  }
}

/** Swap the music (the public table has its own, faster track), fading the old one out quickly. */
export function setTrack(track: Track): void {
  if (track === current) return;
  current = track;
  if (!player) return;
  const p = player;
  let v = p.volume;
  const fade = window.setInterval(() => {
    v = Math.max(0, v - VOLUME / 6);
    p.volume = v;
    if (v > 0) return;
    window.clearInterval(fade);
    p.src = TRACKS[current];
    p.volume = VOLUME;
    sync();
  }, 40);
}
