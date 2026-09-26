/**
 * Game sounds, synthesised with Web Audio so there are no sound files to load, plus a short
 * buzz on phones that support vibration. The first sound must follow a tap (browser rule),
 * which GO always is. Muting is remembered on this device.
 */

export type Sound =
  | "roll"
  | "step"
  | "coin"
  | "chest"
  | "lucky"
  | "bad"
  | "attack"
  | "smash"
  | "shield"
  | "miss"
  | "build";

const MUTE_KEY = "boolionaire-muted";

let context: AudioContext | null = null;
let muted: boolean | null = null;

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

/** One note: a wave that starts at `from` Hz, glides to `to`, and fades out. */
function tone(
  ctx: AudioContext,
  at: number,
  { from, to = from, length, type = "square", volume = 0.12 }: {
    from: number;
    to?: number;
    length: number;
    type?: OscillatorType;
    volume?: number;
  },
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** A burst of noise, for rattles, whooshes and crashes. */
function noise(ctx: AudioContext, at: number, length: number, volume = 0.2, lowpass = 2000): void {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
}

function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (iPhone): sound only.
  }
}

export function play(sound: Sound): void {
  if (isMuted()) return;
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  switch (sound) {
    case "roll":
      for (let i = 0; i < 5; i += 1) noise(ctx, t + i * 0.06, 0.04, 0.25, 3500);
      break;
    case "step":
      tone(ctx, t, { from: 660, to: 880, length: 0.05, volume: 0.05 });
      break;
    case "coin":
      tone(ctx, t, { from: 988, length: 0.08 });
      tone(ctx, t + 0.08, { from: 1319, length: 0.25 });
      break;
    case "chest":
      [523, 659, 784, 1047].forEach((f, i) => tone(ctx, t + i * 0.07, { from: f, length: 0.18, type: "triangle", volume: 0.16 }));
      break;
    case "lucky":
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(ctx, t + i * 0.05, { from: f, length: 0.12, type: "sine", volume: 0.14 }));
      break;
    case "bad":
      tone(ctx, t, { from: 392, to: 330, length: 0.18, type: "sawtooth", volume: 0.08 });
      tone(ctx, t + 0.2, { from: 330, to: 220, length: 0.35, type: "sawtooth", volume: 0.08 });
      buzz(80);
      break;
    case "attack":
      noise(ctx, t, 0.35, 0.18, 1200);
      tone(ctx, t + 0.3, { from: 160, to: 50, length: 0.3, type: "sine", volume: 0.4 });
      buzz([40, 30, 90]);
      break;
    case "smash":
      noise(ctx, t, 0.5, 0.35, 900);
      tone(ctx, t, { from: 120, to: 40, length: 0.45, type: "sine", volume: 0.45 });
      buzz([60, 40, 120]);
      break;
    case "shield":
      tone(ctx, t, { from: 1500, to: 1400, length: 0.4, type: "triangle", volume: 0.15 });
      tone(ctx, t, { from: 2250, to: 2100, length: 0.3, type: "sine", volume: 0.08 });
      buzz(50);
      break;
    case "miss":
      tone(ctx, t, { from: 300, to: 180, length: 0.3, type: "triangle", volume: 0.15 });
      break;
    case "build":
      [392, 523, 659, 784].forEach((f, i) => tone(ctx, t + i * 0.08, { from: f, length: 0.2, type: "triangle", volume: 0.15 }));
      buzz(30);
      break;
  }
}
