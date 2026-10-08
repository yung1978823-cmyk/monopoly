/**
 * Practice wallet on this device: 能量 (shown ×10,000; internal units) and materials for 第三層. When the real wallet arrives,
 * these two functions are the only place that has to change.
 */
import { STORAGE_KEY } from "@/lib/game";
import { WALLET_KEY, newWallet, parseWallet, type Wallet } from "@/lib/realm";
import { COLLECTION_KEY, newCollection, parseCollection, type Collection } from "@/lib/shop";

/**
 * 一個錢包 (Sky 2026-10-08): the 能量 you see everywhere is the single-player board's (kept in coins, 1 coin = 100
 * 能量). The 領地 wallet keeps only the materials; its 能量 is read from and written to the board's save, in table
 * units (1 unit = 100 coins = 10,000 能量). The board listens for ENERGY_EVENT to pick up spending done elsewhere.
 */
export const ENERGY_EVENT = "boolionaire-energy";
const COINS_PER_UNIT = 100;

function readSave(): { v?: number; pages?: number; state?: { points?: number } } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadWallet(): Wallet {
  let stock = newWallet().stock;
  try {
    const saved = localStorage.getItem(WALLET_KEY);
    if (saved) stock = parseWallet(JSON.parse(saved)).stock;
  } catch {
    // Fresh materials.
  }
  const coins = readSave()?.state?.points;
  return { points: typeof coins === "number" && coins >= 0 ? coins / COINS_PER_UNIT : 0, stock };
}

export function saveWallet(wallet: Wallet): void {
  const coins = Math.max(0, Math.round(wallet.points * COINS_PER_UNIT));
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify({ points: 0, stock: wallet.stock, merged: true }));
    const save = readSave();
    if (save?.state) {
      save.state.points = coins;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    }
  } catch {
    // Not remembered on this device.
  }
  try {
    window.dispatchEvent(new CustomEvent(ENERGY_EVENT, { detail: coins }));
  } catch {
    // No page to tell.
  }
}

/**
 * Once: 能量 that was sitting in the old separate 領地 wallet moves into the one wallet. Returns the coins to add.
 */
export function takeOldRealmEnergy(): number {
  try {
    const saved = localStorage.getItem(WALLET_KEY);
    if (!saved) return 0;
    const raw = JSON.parse(saved) as { points?: number; merged?: boolean };
    if (raw.merged) return 0;
    const stock = parseWallet(raw).stock;
    localStorage.setItem(WALLET_KEY, JSON.stringify({ points: 0, stock, merged: true }));
    return typeof raw.points === "number" && raw.points > 0 ? Math.round(raw.points * COINS_PER_UNIT) : 0;
  } catch {
    return 0;
  }
}

/** 商店: what you've drawn, bought and watched, on this device. */
export function loadCollection(): Collection {
  try {
    const saved = localStorage.getItem(COLLECTION_KEY);
    return saved ? parseCollection(JSON.parse(saved)) : newCollection();
  } catch {
    return newCollection();
  }
}

export function saveCollection(collection: Collection): void {
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  } catch {
    // Not remembered on this device.
  }
}
