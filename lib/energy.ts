/**
 * 能量 (Energy) is the game's one currency (Sky 2026-10-07: 金幣 and DST are gone).
 *
 * The game logic keeps its old small units so saves and tests stay the same; only what the player
 * sees is scaled:
 * - the daily board (state.points, costs, chests, the black hole, attacks, theme rewards): 1 unit = 100 能量;
 * - the public table and the realm (cash, rent, prices, tickets, the wallet): 1 unit = 10,000 能量.
 */
export const COIN_ENERGY = 100;
export const TABLE_ENERGY = 10_000;
export const ENERGY_ICON = "/art/ui/energy.webp";

/** A daily-board amount as 能量. */
export function coinEnergy(n: number): number {
  return Math.round(n * COIN_ENERGY);
}

/** A public-table or realm amount (one decimal) as 能量. */
export function tableEnergy(n: number): number {
  return Math.round(n * TABLE_ENERGY);
}

/** An energy amount with thousands separators, e.g. 180000 → "180,000". */
export function formatEnergy(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * A short form for tight spots (a seat badge, the big lobby numbers): 200000 → "20萬" / "20万" / "200K".
 * Below 10,000 it is the plain number.
 */
export function compactEnergy(n: number, lang: "hant" | "hans" | "en"): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(Math.round(n));
  if (abs < 10_000) return sign + formatEnergy(abs);
  const trim = (value: number) => String(Math.round(value * 10) / 10);
  if (lang === "en") return `${sign}${trim(abs / 1000)}K`;
  return `${sign}${trim(abs / 10_000)}${lang === "hans" ? "万" : "萬"}`;
}
