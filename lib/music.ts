/**
 * 背景音樂 (Sky 2026-10-01): one looping track (her Suno "Ghostly Board Night", version A), quiet under the
 * sound effects. Browsers only let sound start after a tap, so it waits for the first one; it pauses while the
 * game is in the background. On or off is remembered on this device, and on by default.
 */
const TRACK = "https://cdn.acedata2.cloud/suno/37a666a8-9141-4425-b634-46195251ed59.mp3";
const KEY = "boolionaire-music";
const VOLUME = 0.32;

let player: HTMLAudioElement | null = null;
let ready = false;

export function isMusicOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

function sync() {
  if (!player) return;
  if (isMusicOn() && ready && document.visibilityState === "visible") void player.play().catch(() => undefined);
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

/** Call once when the game starts: the music begins at the first tap. */
export function initMusic(): void {
  if (typeof window === "undefined" || player) return;
  player = new Audio(TRACK);
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
