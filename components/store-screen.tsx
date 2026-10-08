"use client";

import { useEffect, useState } from "react";

import { FakeAd } from "@/components/fake-ad";
import { juice } from "@/components/juice";
import { loadCollection, loadWallet, saveCollection, saveWallet } from "@/components/wallet-store";
import { ENERGY_ICON, formatEnergy, tableEnergy } from "@/lib/energy";
import { useLang } from "@/lib/i18n";
import { MATERIALS, addStock, type BuildingKind, type Wallet } from "@/lib/realm";
import { dayKeyOf } from "@/lib/rules";
import { play } from "@/lib/sfx";
import {
  AD_ENERGY,
  AD_MATERIALS,
  ADS_PER_DAY,
  DUPLICATE_SHARDS,
  HEROES,
  HOUSES,
  MATERIAL_BUNDLES,
  MONTH_CARD,
  ODDS,
  PACKS,
  PITY,
  PULL_PRICE,
  RARITIES,
  TEN_PRICE,
  addDays,
  adsLeft,
  dealsOf,
  draw,
  newCollection,
  watchAd,
  type Collection,
  type PoolId,
  type Prize,
  type Pull,
  type Rarity,
} from "@/lib/shop";
import { cn } from "cn";

type Tab = "draw" | "energy" | "materials" | "deals";
const TABS: [Tab, string][] = [
  ["draw", "抽卡"],
  ["energy", "能量"],
  ["materials", "材料"],
  ["deals", "精選"],
];
const HOUSE_NAMES: Record<BuildingKind, string> = { facade: "門面", table: "加枱", rent: "租金屋", station: "車站", chance: "機會屋" };
const MAT_NAMES = { wood: "木材", stone: "石磚", gold: "金塊" } as const;
const RARITY_STYLE: Record<Rarity, string> = {
  SSR: "bg-gradient-to-b from-[#FFE27A] to-[#F59E0B] text-[#7C2D12] border-[#FBD000]",
  SR: "bg-gradient-to-b from-[#E9D5FF] to-[#A855F7] text-white border-[#C084FC]",
  R: "bg-gradient-to-b from-[#DBEAFE] to-[#60A5FA] text-white border-[#93C5FD]",
  N: "bg-gradient-to-b from-[#F1F5F9] to-[#CBD5E1] text-[#334155] border-[#E2E8F0]",
};
const E = (n: number) => formatEnergy(tableEnergy(n));
const today = () => dayKeyOf(Date.now());

function PrizePic({ prize, className }: { prize: Prize; className?: string }) {
  if (prize.kind === "hero") {
    const hero = HEROES.find((h) => h.id === prize.id)!;
    return hero.avatar ? (
      <img src={hero.avatar} alt="" className={cn("rounded-full border-2 border-white object-cover", className)} />
    ) : (
      <span className={cn("flex items-center justify-center rounded-full border-2 border-white bg-[#1E293B] text-3xl", className)}>{hero.emoji}</span>
    );
  }
  if (prize.kind === "house") return <img src={`/art/realm/${prize.id}.webp`} alt="" className={cn("object-contain", className)} />;
  return <img src="/art/realm/wood.webp" alt="" className={cn("object-contain", className)} />;
}

function prizeName(prize: Prize, t: (s: string, v?: Record<string, string | number>) => string): string {
  if (prize.kind === "hero") return t(HEROES.find((h) => h.id === prize.id)!.name);
  if (prize.kind === "house") return t("{name}券", { name: t(HOUSE_NAMES[prize.id]) });
  return MATERIALS.filter((m) => prize.stock[m] > 0)
    .map((m) => `${t(MAT_NAMES[m])}×${prize.stock[m]}`)
    .join(" ");
}

/**
 * 商店 (Sky 2026-10-08): 抽卡 for characters and 領地 houses, 能量 packs (test purchases until the app is in the
 * stores), materials and 精選, all paid in 能量. Free claims by watching an ad, up to ADS_PER_DAY a day.
 */
export function StoreScreen({ onExit }: { onExit: () => void }) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("draw");
  const [wallet, setWallet] = useState<Wallet>({ points: 0, stock: { wood: 0, stone: 0, gold: 0 } });
  const [col, setCol] = useState<Collection>(newCollection());
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<Pull[] | null>(null);
  const [odds, setOdds] = useState(false);
  const [ad, setAd] = useState<null | (() => void)>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => {
      setWallet(loadWallet());
      setCol(loadCollection());
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  const day = today();
  const left = adsLeft(col, day);

  const save = (next: { wallet?: Wallet; col?: Collection }) => {
    if (next.wallet) {
      setWallet(next.wallet);
      saveWallet(next.wallet);
    }
    if (next.col) {
      setCol(next.col);
      saveCollection(next.col);
    }
  };
  const flash = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(""), 1800);
  };
  const spend = (price: number) => {
    if (wallet.points < price) {
      play("miss");
      flash(t("能量唔夠"));
      return null;
    }
    return { ...wallet, points: Math.round((wallet.points - price) * 100) / 100 };
  };

  function pull(pool: PoolId, times: 1 | 10) {
    const paid = spend(times === 10 ? TEN_PRICE : PULL_PRICE);
    if (!paid) return;
    const out = draw(col, pool, times, Math.random);
    save({ wallet: addStock(paid, out.materials), col: out.collection });
    const best = out.pulls.some((p) => p.rarity === "SSR") ? "large" : out.pulls.some((p) => p.rarity === "SR") ? "medium" : "small";
    juice(best, undefined, window.innerHeight * 0.4);
    play(best === "small" ? "coin" : "chest");
    setResult(out.pulls);
  }

  function freeAd(kind: "energy" | "materials") {
    const counted = watchAd(col, day);
    if (!counted) return;
    setAd(() => () => {
      const w = loadWallet();
      const next = kind === "energy" ? { ...w, points: w.points + AD_ENERGY } : addStock(w, AD_MATERIALS);
      save({ wallet: next, col: counted });
      play("coin");
      flash(kind === "energy" ? t("+{n} 能量", { n: E(AD_ENERGY) }) : t("攞到材料"));
    });
  }

  function buyPack(id: string) {
    const pack = PACKS.find((p) => p.id === id)!;
    if (pack.once && col.starter) return;
    const next = addStock({ ...wallet, points: wallet.points + pack.energy }, { wood: 0, stone: 0, gold: pack.gold });
    save({ wallet: next, col: pack.once ? { ...col, starter: true } : undefined });
    juice("medium", undefined, window.innerHeight * 0.4);
    play("chest");
    flash(t("（測試）已加 {n} 能量", { n: E(pack.energy) }));
  }

  const monthActive = !!col.monthUntil && col.monthUntil >= day;
  function buyMonth() {
    const from = monthActive ? col.monthUntil! : day;
    save({ col: { ...col, monthUntil: addDays(from, MONTH_CARD.days) } });
    play("chest");
    flash(t("（測試）月卡生效"));
  }
  function claimMonth() {
    if (!monthActive || col.monthClaimed === day) return;
    save({ wallet: { ...wallet, points: wallet.points + MONTH_CARD.daily }, col: { ...col, monthClaimed: day } });
    play("coin");
    flash(t("+{n} 能量", { n: E(MONTH_CARD.daily) }));
  }

  function buyBundle(id: string) {
    const b = MATERIAL_BUNDLES.find((x) => x.id === id)!;
    const paid = spend(b.price);
    if (!paid) return;
    save({ wallet: addStock(paid, b.stock) });
    play("coin");
  }

  const deals = dealsOf(day);
  const boughtDeals = col.deals.day === day ? col.deals.bought : [];
  function buyDeal(id: string) {
    const deal = deals.find((d) => d.id === id)!;
    if (boughtDeals.includes(id)) return;
    const paid = spend(deal.price);
    if (!paid) return;
    let next: Collection = { ...col, heroes: { ...col.heroes }, vouchers: { ...col.vouchers }, deals: { day, bought: [...boughtDeals, id] } };
    if (deal.prize.kind === "hero") {
      if ((next.heroes[deal.prize.id] ?? 0) > 0) next = { ...next, shards: next.shards + DUPLICATE_SHARDS };
      next.heroes[deal.prize.id] = (next.heroes[deal.prize.id] ?? 0) + 1;
    } else if (deal.prize.kind === "house") next.vouchers[deal.prize.id] = (next.vouchers[deal.prize.id] ?? 0) + 1;
    save({ wallet: paid, col: next });
    play("chest");
  }

  const card = "rounded-2xl border-[3px] border-white bg-white/95 p-2 text-[#1E3A8A] shadow-md";
  const buyBtn = "mt-1 flex h-9 w-full cursor-pointer items-center justify-center gap-1 rounded-full border-2 border-[#FBD000] bg-[#16A34A] text-sm font-black text-white shadow-[0_3px_0_#166534] active:translate-y-0.5 disabled:cursor-default disabled:opacity-50";

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#4C1D95] to-[#1E1B4B] text-white" data-testid="store">
      <header className="flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button type="button" onClick={onExit} className="flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-xl font-black shadow-md" aria-label={t("返回")}>
          ←
        </button>
        <p className="flex-1 text-center text-xl font-black">{t("商店")}</p>
        <div className="flex items-center gap-1 rounded-full border-2 border-[#FBD000] bg-white py-0.5 pl-1 pr-2.5 text-sm font-black tabular-nums text-[#1E3A8A] shadow-md">
          <img src={ENERGY_ICON} alt={t("能量")} className="-my-1 -ml-2 size-8 object-contain" />
          {loaded ? E(wallet.points) : "…"}
        </div>
      </header>
      <div className="mt-1 flex justify-center gap-2 px-3 text-xs font-black text-white/80">
        {MATERIALS.map((m) => (
          <span key={m} className="inline-flex items-center gap-0.5">
            <img src={`/art/realm/${m}.webp`} alt="" className="size-5 object-contain" />
            {wallet.stock[m]}
          </span>
        ))}
      </div>

      {/* Free claims for an ad (Sky 2026-10-08: 14 a day, shared with the board's 雙倍). */}
      <section className="mx-3 mt-2 rounded-2xl border-2 border-[#FBD000]/70 bg-[#7C3AED]/60 p-2" data-testid="free-ads">
        <p className="text-center text-xs font-black">{t("📺 睇廣告免費領（今日仲有 {n}／{total} 次）", { n: left, total: ADS_PER_DAY })}</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <button type="button" disabled={left <= 0} onClick={() => freeAd("energy")} className={buyBtn} data-testid="ad-energy">
            <img src={ENERGY_ICON} alt="" className="size-5" /> +{E(AD_ENERGY)}
          </button>
          <button type="button" disabled={left <= 0} onClick={() => freeAd("materials")} className={buyBtn} data-testid="ad-materials">
            <img src="/art/realm/wood.webp" alt="" className="size-5" />+{AD_MATERIALS.wood}
            <img src="/art/realm/stone.webp" alt="" className="size-5" />+{AD_MATERIALS.stone}
          </button>
        </div>
      </section>

      <nav className="mx-3 mt-2 grid grid-cols-4 gap-1">
        {TABS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn("h-9 cursor-pointer rounded-full border-2 text-sm font-black", tab === id ? "border-[#FBD000] bg-[#FFF8D6] text-[#1E3A8A]" : "border-white/30 bg-white/10")}
          >
            {t(name)}
          </button>
        ))}
      </nav>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {tab === "draw" ? (
          <div className="space-y-3">
            {(["hero", "house"] as PoolId[]).map((pool) => (
              <section key={pool} className={card} data-testid={`pool-${pool}`}>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-black">{pool === "hero" ? t("角色卡池") : t("房屋卡池")}</p>
                  <button type="button" onClick={() => setOdds(true)} className="cursor-pointer rounded-full bg-[#E0E7FF] px-2 py-0.5 text-xs font-black">
                    {t("機率")}
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(pool === "hero" ? HEROES.map((h) => ({ prize: { kind: "hero", id: h.id } as Prize, rarity: h.rarity })) : HOUSES.map((h) => ({ prize: { kind: "house", id: h.id } as Prize, rarity: h.rarity }))).map(({ prize, rarity }) => (
                    <span key={prize.kind === "materials" ? "m" : prize.id} className={cn("relative flex size-12 items-center justify-center rounded-xl border-2", RARITY_STYLE[rarity])}>
                      <PrizePic prize={prize} className="size-10" />
                      <span className="absolute -bottom-1.5 rounded-full bg-black/60 px-1 text-[9px] font-black text-white">{rarity}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] font-bold text-[#475569]">
                  {t("保底：{n} 抽內必有 SSR（已抽 {m}）", { n: PITY, m: col.sinceSSR[pool] })}
                </p>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => pull(pool, 1)} className={buyBtn} data-testid={`pull1-${pool}`}>
                    {t("抽 1 次")} <img src={ENERGY_ICON} alt="" className="size-5" />
                    {E(PULL_PRICE)}
                  </button>
                  <button type="button" onClick={() => pull(pool, 10)} className={cn(buyBtn, "bg-[#E52521] shadow-[0_3px_0_#991B1B]")} data-testid={`pull10-${pool}`}>
                    {t("十連抽")} <img src={ENERGY_ICON} alt="" className="size-5" />
                    {E(TEN_PRICE)}
                  </button>
                </div>
              </section>
            ))}
            <section className={card} data-testid="collection">
              <p className="text-lg font-black">{t("我嘅收藏")}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {HEROES.map((h) => (
                  <span key={h.id} className={cn("flex flex-col items-center text-[10px] font-black", !col.heroes[h.id] && "opacity-30 grayscale")}>
                    <PrizePic prize={{ kind: "hero", id: h.id }} className="size-10" />
                    {t(h.name)}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs font-black">{t("碎片 {n}", { n: col.shards })}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs font-black">
                {HOUSES.map((h) => (
                  <span key={h.id} className={cn("inline-flex items-center gap-0.5", !col.vouchers[h.id] && "opacity-40")}>
                    <img src={`/art/realm/${h.id}.webp`} alt="" className="size-6 object-contain" />
                    {t("{name}券", { name: t(HOUSE_NAMES[h.id]) })}×{col.vouchers[h.id] ?? 0}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[11px] font-bold text-[#475569]">{t("房屋券可以喺領地免材料起嗰間屋")}</p>
            </section>
          </div>
        ) : null}

        {tab === "energy" ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-bold text-white/70">{t("（測試）而家撳就直接加能量，上架之後會經 App Store／Google Play 付款")}</p>
            {PACKS.map((pack) => {
              const done = pack.once && col.starter;
              return (
                <section key={pack.id} className={cn(card, "flex items-center gap-3")} data-testid={`pack-${pack.id}`}>
                  <img src={ENERGY_ICON} alt="" className="size-12" />
                  <div className="flex-1">
                    <p className="font-black">{t(pack.name)}{pack.once ? <span className="ml-1 rounded-full bg-[#E52521] px-1.5 text-[10px] text-white">{t("限買一次")}</span> : null}</p>
                    <p className="text-sm font-bold">
                      {E(pack.energy)} {t("能量")}
                      {pack.gold ? ` + ${t("金塊")}×${pack.gold}` : ""}
                    </p>
                  </div>
                  <button type="button" disabled={!!done} onClick={() => buyPack(pack.id)} className={cn(buyBtn, "mt-0 w-24")}>
                    {done ? t("已買") : pack.price}
                  </button>
                </section>
              );
            })}
            <section className={cn(card, "flex items-center gap-3")} data-testid="month-card">
              <span className="text-4xl">📅</span>
              <div className="flex-1">
                <p className="font-black">{t("月卡")}</p>
                <p className="text-xs font-bold">{t("{d} 日內每日領 {n} 能量", { d: MONTH_CARD.days, n: E(MONTH_CARD.daily) })}</p>
                {monthActive ? <p className="text-[11px] font-bold text-[#16A34A]">{t("有效至 {day}", { day: col.monthUntil! })}</p> : null}
              </div>
              <div className="flex w-24 flex-col gap-1">
                <button type="button" onClick={buyMonth} className={cn(buyBtn, "mt-0")}>
                  {MONTH_CARD.price}
                </button>
                {monthActive ? (
                  <button type="button" disabled={col.monthClaimed === day} onClick={claimMonth} className={cn(buyBtn, "mt-0 bg-[#F59E0B] shadow-[0_3px_0_#B45309]")} data-testid="month-claim">
                    {col.monthClaimed === day ? t("今日已領") : t("領取")}
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "materials" ? (
          <div className="space-y-2">
            {MATERIAL_BUNDLES.map((b) => {
              const m = MATERIALS.find((x) => b.stock[x] > 0)!;
              return (
                <section key={b.id} className={cn(card, "flex items-center gap-3")}>
                  <img src={`/art/realm/${m}.webp`} alt="" className="size-12 object-contain" />
                  <p className="flex-1 font-black">
                    {t(MAT_NAMES[m])} ×{b.stock[m]}
                  </p>
                  <button type="button" onClick={() => buyBundle(b.id)} className={cn(buyBtn, "mt-0 w-28")}>
                    <img src={ENERGY_ICON} alt="" className="size-5" />
                    {E(b.price)}
                  </button>
                </section>
              );
            })}
          </div>
        ) : null}

        {tab === "deals" ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-bold text-white/70">{t("每日兩樣特價，明日換過")}</p>
            {deals.map((deal) => {
              const done = boughtDeals.includes(deal.id);
              return (
                <section key={deal.id} className={cn(card, "flex items-center gap-3")}>
                  <PrizePic prize={deal.prize} className="size-14" />
                  <div className="flex-1">
                    <p className="font-black">{prizeName(deal.prize, t)}</p>
                    <p className="text-xs font-bold text-[#64748B] line-through">{E(deal.was)}</p>
                  </div>
                  <button type="button" disabled={done} onClick={() => buyDeal(deal.id)} className={cn(buyBtn, "mt-0 w-28")}>
                    {done ? t("已買") : (
                      <>
                        <img src={ENERGY_ICON} alt="" className="size-5" />
                        {E(deal.price)}
                      </>
                    )}
                  </button>
                </section>
              );
            })}
          </div>
        ) : null}
      </div>

      {note ? (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 z-40 mx-auto w-fit animate-[pop_0.3s_ease-out] rounded-full bg-black/80 px-4 py-2 text-lg font-black">{note}</p>
      ) : null}

      {result ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-4" data-testid="draw-result">
          <div className={cn("grid gap-2", result.length > 1 ? "grid-cols-5" : "grid-cols-1")}>
            {result.map((p, k) => (
              <div
                key={k}
                className={cn("flex flex-col items-center rounded-xl border-2 p-1 animate-[pop_0.35s_ease-out_both]", RARITY_STYLE[p.rarity], result.length > 1 ? "w-16" : "w-36")}
                style={{ animationDelay: `${k * 90}ms` }}
              >
                <span className="text-xs font-black">{p.rarity}</span>
                <PrizePic prize={p.prize} className={result.length > 1 ? "size-11" : "size-24"} />
                <span className="mt-0.5 text-center text-[10px] font-black leading-tight">{prizeName(p.prize, t)}</span>
                {p.duplicate ? <span className="text-[9px] font-black">{t("重複→碎片")}</span> : null}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setResult(null)} className="mt-6 h-12 w-40 cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#16A34A] text-lg font-black shadow-[0_4px_0_#166534]">
            OK
          </button>
        </div>
      ) : null}

      {odds ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-6" onClick={() => setOdds(false)} data-testid="odds">
          <div className="w-full rounded-2xl bg-white p-4 text-[#1E3A8A]">
            <p className="text-center text-lg font-black">{t("抽卡機率")}</p>
            <table className="mt-2 w-full text-sm font-black">
              <tbody>
                {RARITIES.map((r) => (
                  <tr key={r} className="border-b border-[#E2E8F0]">
                    <td className="py-1">{r}</td>
                    <td className="py-1 text-right">{ODDS[r]}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs font-bold text-[#475569]">{t("N 係材料；十連抽保證最少一個 SR 或以上；連續 {n} 抽冇 SSR，第 {n} 抽必定係 SSR。", { n: PITY })}</p>
            <p className="mt-1 text-xs font-bold text-[#475569]">{t("同一等級入面每樣嘢機會均等。")}</p>
          </div>
        </div>
      ) : null}

      {ad ? (
        <FakeAd
          onCancel={() => setAd(null)}
          onDone={() => {
            ad();
            setAd(null);
          }}
        />
      ) : null}
    </main>
  );
}

