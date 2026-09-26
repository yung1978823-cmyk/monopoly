/**
 * Practice wallet on this device: points and materials for 第三層. When the real wallet arrives,
 * these two functions are the only place that has to change.
 */
import { WALLET_KEY, newWallet, parseWallet, type Wallet } from "@/lib/realm";

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
