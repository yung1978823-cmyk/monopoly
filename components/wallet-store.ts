/**
 * Practice wallet on this device: 能量 (shown ×10,000; internal units) and materials for 第三層. When the real wallet arrives,
 * these two functions are the only place that has to change.
 */
import { WALLET_KEY, newWallet, parseWallet, type Wallet } from "@/lib/realm";
import { COLLECTION_KEY, newCollection, parseCollection, type Collection } from "@/lib/shop";

export function loadWallet(): Wallet {
  try {
    const saved = localStorage.getItem(WALLET_KEY);
    return saved ? parseWallet(JSON.parse(saved)) : newWallet();
  } catch {
    return newWallet();
  }
}

export function saveWallet(wallet: Wallet): void {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  } catch {
    // Not remembered on this device.
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
