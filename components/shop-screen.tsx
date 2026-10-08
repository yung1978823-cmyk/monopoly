"use client";

import { juiceAt } from "@/components/juice";
import { DICE_CAP } from "@/lib/rules";
import { ENERGY_ICON, coinEnergy, formatEnergy } from "@/lib/energy";
import { shopOffers, type GameState, type ShopItem } from "@/lib/game";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { cn } from "cn";

const PIC: Record<ShopItem, string> = {
  dice: "/art/ui/dice.webp",
  meat: "/art/icons/meat.webp",
  juice: "/art/ui/crystal.webp",
};
const NAME: Record<ShopItem, string> = { dice: "骰仔", meat: "肉", juice: "水晶" };

/**
 * 神秘商人 (Sky 2026-10-08): a hooded merchant's stall with today's three offers (one of them a 特價 double pack).
 * Each can be bought once per visit with 能量; leave whenever you like.
 */
export function ShopScreen({ state, onBuy, onLeave }: { state: GameState; onBuy: (index: number) => void; onLeave: () => void }) {
  const { t } = useLang();
  const offers = shopOffers(state.dayKey);

  return (
    <main
      className="relative mx-auto flex h-dvh w-full max-w-md flex-col items-center overflow-hidden px-4 text-white"
      style={{ background: "radial-gradient(circle at 50% 30%, #6d28d9 0%, #2e1065 55%, #120626 100%)" }}
      data-testid="shop"
    >
      <header className="mt-[max(env(safe-area-inset-top),1.2rem)] flex flex-col items-center">
        <img src="/art/icons/shop.webp" alt="" draggable={false} className="size-28 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)] animate-[thief-idle_2.4s_ease-in-out_infinite]" />
        <p className="-mt-1 rounded-full border-2 border-[#FBD000] bg-[#7C3AED] px-4 py-0.5 text-xl font-black shadow">{t("神秘商人")}</p>
        <p className="mt-2 text-sm font-bold text-white/80">{t("今日貨品，明日換過")}</p>
      </header>

      <div className="mt-3 flex items-center gap-1.5 rounded-full border-2 border-[#FBD000] bg-white py-1 pl-1.5 pr-3 text-lg font-black tabular-nums text-[#1E3A8A] shadow-md">
        <img src={ENERGY_ICON} alt={t("能量")} className="-my-2 -ml-3 size-10 object-contain" />
        {formatEnergy(coinEnergy(state.points))}
      </div>

      <div className="mt-5 grid w-full grid-cols-3 gap-2.5">
        {offers.map((offer, i) => {
          const bought = state.shopBought.includes(i);
          const full = offer.item === "dice" && state.dice >= DICE_CAP;
          const poor = state.points < offer.price;
          const off = bought || full || poor;
          return (
            <button
              key={i}
              type="button"
              disabled={off}
              onClick={(e: { currentTarget: Element }) => {
                juiceAt(offer.deal ? "medium" : "small", e.currentTarget);
                play("coin");
                onBuy(i);
              }}
              className={cn(
                "relative flex cursor-pointer flex-col items-center rounded-2xl border-[3px] bg-white px-1 pb-2 pt-3 text-[#1E3A8A] shadow-[0_5px_0_rgba(0,0,0,0.35)] transition active:translate-y-1",
                offer.deal ? "border-[#FBD000]" : "border-white/80",
                off && "cursor-default opacity-50 active:translate-y-0",
              )}
              data-testid={`shop-offer-${i}`}
            >
              {offer.deal ? (
                <span className="absolute -top-3 rounded-full bg-[#E52521] px-2 text-xs font-black text-white shadow">{t("特價")}</span>
              ) : null}
              <img src={PIC[offer.item]} alt="" draggable={false} className="size-14 object-contain drop-shadow-[0_3px_5px_rgba(0,0,0,0.3)]" />
              <p className="mt-1 text-base font-black">
                {t(NAME[offer.item])} ×{offer.amount}
              </p>
              <p className="mt-1 flex items-center gap-0.5 rounded-full bg-[#1E3A8A] px-2 py-0.5 text-sm font-black tabular-nums text-white">
                {bought ? (
                  t("已買")
                ) : full ? (
                  t("骰滿咗")
                ) : (
                  <>
                    <img src={ENERGY_ICON} alt="" className="-my-1 size-5 object-contain" />
                    {formatEnergy(coinEnergy(offer.price))}
                  </>
                )}
              </p>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onLeave}
        className="mb-[max(env(safe-area-inset-bottom),1.2rem)] mt-auto h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#16A34A] text-xl font-black text-white shadow-[0_5px_0_#166534]"
        data-testid="shop-leave"
      >
        {t("返去棋盤")}
      </button>
    </main>
  );
}
