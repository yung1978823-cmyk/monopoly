"use client";

import { type Decor } from "@/components/eight-scene";
import { IslandHome } from "@/components/island-home";
import { CAST, EightBoard } from "@/components/table-game";
import { loadCollection, loadWallet, saveCollection, saveWallet } from "@/components/wallet-store";
import { ENERGY_ICON, formatEnergy, tableEnergy } from "@/lib/energy";
import { useLang } from "@/lib/i18n";
import {
  BUILDING_KINDS,
  HOUSE_RENT,
  LANDS,
  LAND_KINDS,
  LISTINGS,
  MATERIALS,
  MATERIAL_PRICE,
  MAX_PLAYERS,
  MAX_TICKET,
  MIN_PLAYERS,
  RECIPES,
  REALM_KEY,
  STATION_TURNS,
  boardOf,
  build,
  buyLand,
  buyMaterial,
  canPlace,
  count,
  demolish,
  emptyRealm,
  hasStock,
  housesOf,
  parseRealm,
  rulesOf,
  setMinPlayers,
  setTicket,
  tablesOf,
  turnsOf,
  type BuildingKind,
  type DeckId,
  type LandKind,
  type Listing,
  type Material,
  type Realm,
  type Wallet,
} from "@/lib/realm";
import { juice, juiceAt } from "@/components/juice";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Sky's drawn pictures (2026-10-01) for lands, materials and buildings, in place of emoji. */
const pic = (name: string, className: string) => <img src={`/art/realm/${name}.webp`} alt="" draggable={false} className={cn("inline-block object-contain", className)} />;
const ICONS: Record<BuildingKind, string> = { facade: "facade", table: "table", rent: "rent", station: "station", chance: "chance" };
const NAMES: Record<BuildingKind, string> = { facade: "門面", table: "加枱", rent: "租金屋", station: "車站", chance: "機會屋" };
const LAND_ICONS: Record<LandKind, string> = { island: "island", mountain: "mountain", volcano: "volcano" };
const LAND_NAMES: Record<LandKind, string> = { island: "海島", mountain: "山城", volcano: "火山" };
const LAND_NOTES: Record<LandKind, string> = {
  island: "圓形小島，中間有燈塔，碼頭可以坐船",
  mountain: "之字山路，上山落山，有纜車",
  volcano: "外圈加內圈兩層，用橋連接",
};
const MATERIAL_ICONS: Record<Material, string> = { wood: "wood", stone: "stone", gold: "gold" };
const MATERIAL_NAMES: Record<Material, string> = { wood: "木材", stone: "石磚", gold: "金塊" };
const DECK_NAMES: Record<DeckId, string> = { standard: "標準", wild: "大起大落", calm: "平穩" };

function decorOf(realm: Realm): Decor {
  return { houses: housesOf(realm), facade: count(realm, "facade") > 0, stations: count(realm, "station") };
}

function loadRealm(): Realm {
  try {
    const saved = localStorage.getItem(REALM_KEY);
    return saved ? parseRealm(JSON.parse(saved)) : emptyRealm();
  } catch {
    return emptyRealm();
  }
}

function saveRealm(realm: Realm) {
  try {
    localStorage.setItem(REALM_KEY, JSON.stringify(realm));
  } catch {
    // Not remembered on this device.
  }
}

type Game = { id: number; kind: "host" } | { id: number; kind: "guest"; listing: Listing };

/** 第三層 領地 (practice): the list of lands to visit, and your own land (empty until you buy one). */
export function RealmScreen({ onExit }: { onExit: () => void }) {
  const { t } = useLang();
  const [realm, setRealm] = useState<Realm>(() => emptyRealm());
  const [wallet, setWallet] = useState<Wallet>({ points: 0, stock: { wood: 0, stone: 0, gold: 0 } });
  const [tab, setTab] = useState<"list" | "mine">("mine");
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setRealm(loadRealm());
      setWallet(loadWallet());
    }, 0);
    return () => window.clearTimeout(id);
  }, [game]);

  const update = (next: { realm?: Realm; wallet?: Wallet }) => {
    if (next.realm) {
      setRealm(next.realm);
      saveRealm(next.realm);
    }
    if (next.wallet) {
      setWallet(next.wallet);
      saveWallet(next.wallet);
    }
  };

  if (game?.kind === "host") {
    return (
      <EightBoard
        key={game.id}
        players={CAST.slice(1, 1 + realm.minPlayers)}
        board={boardOf(realm)}
        rules={rulesOf(realm)}
        decor={decorOf(realm)}
        realm={realm}
        onExit={() => setGame(null)}
        onAgain={() => setGame({ id: Date.now(), kind: "host" })}
      />
    );
  }
  if (game?.kind === "guest") {
    const land = game.listing.realm;
    return (
      <EightBoard
        key={game.id}
        players={CAST.slice(0, land.minPlayers)}
        board={boardOf(land)}
        rules={rulesOf(land)}
        decor={decorOf(land)}
        guestTicket={land.ticket}
        onExit={() => setGame(null)}
        onAgain={() => setGame(null)}
      />
    );
  }

  const join = (listing: Listing) => {
    if (wallet.points < listing.realm.ticket) return;
    play("coin");
    update({ wallet: { ...wallet, points: wallet.points - listing.realm.ticket } });
    setGame({ id: Date.now(), kind: "guest", listing });
  };

  return (
    <main
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#2A1A5E] bg-cover bg-center text-[#1E3A8A]"
      // Sky's purple-blue nebula (2026-10-02), the same sky as the island board in a game.
      style={{ backgroundImage: "linear-gradient(rgba(10,8,40,0.1), rgba(10,8,40,0.3)), url(/art/space-realm.webp)" }}
      data-testid="realm"
    >
      <header className="z-10 mx-auto flex w-full max-w-xl flex-col gap-2 px-3 pt-[max(env(safe-area-inset-top),0.6rem)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-xl font-black text-white shadow-md"
            aria-label={t("返回")}
          >
            ←
          </button>
          <h1 className="flex flex-1 items-center justify-center gap-1.5 text-2xl font-black text-white drop-shadow-[0_3px_0_#1E3A8A]">
            <img src="/art/ui/land.webp" alt="" className="size-9 object-contain" />
            {t("領地")}
          </h1>
          <span className="rounded-full bg-[#FBD000] px-2 py-0.5 text-xs font-black">{t("練習版")}</span>
        </div>
        <WalletBar wallet={wallet} />
        <div className="grid grid-cols-2 gap-2" role="tablist">
          {(["list", "mine"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "cursor-pointer rounded-full border-[3px] py-1.5 font-black",
                tab === id ? "border-[#FBD000] bg-[#E52521] text-white" : "border-transparent bg-white/85",
              )}
              data-testid={`tab-${id}`}
            >
              {id === "list" ? t("領地列表") : t("我嘅領地")}
            </button>
          ))}
        </div>
      </header>

      {tab === "list" ? (
        <RealmList realm={realm} wallet={wallet} onJoin={join} onMine={() => setTab("mine")} />
      ) : realm.land ? (
        <RealmEditor realm={realm} wallet={wallet} onChange={update} onHost={() => setGame({ id: Date.now(), kind: "host" })} />
      ) : (
        <EmptyLand wallet={wallet} onBuy={(land) => update(buyLand(realm, wallet, land))} />
      )}
    </main>
  );
}

function WalletBar({ wallet }: { wallet: Wallet }) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm font-black tabular-nums" aria-label={t("我嘅能量同材料")} data-testid="wallet">
      <span>
        <img src={ENERGY_ICON} alt={t("能量")} className="inline size-4 align-[-3px]" /> {formatEnergy(tableEnergy(wallet.points))}
      </span>
      {MATERIALS.map((m) => (
        <span key={m}>
          {pic(MATERIAL_ICONS[m], "size-5 align-[-5px]")} {wallet.stock[m]}
        </span>
      ))}
    </div>
  );
}

/** No land yet: an empty plot and the three kinds of land to buy. */
function EmptyLand({ wallet, onBuy }: { wallet: Wallet; onBuy: (land: LandKind) => void }) {
  const { t } = useLang();
  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-3" data-testid="empty-land">
      <div className="rounded-3xl border-4 border-dashed border-white/50 bg-[#5FAE4A]/40 py-8 text-center font-black text-white">
        <p className="text-5xl">🌱</p>
        <p className="mt-2 text-lg">{t("呢度仲係一片空地")}</p>
        <p className="text-sm opacity-80">{t("買咗地先可以起屋同開局")}</p>
      </div>
      {LAND_KINDS.map((land) => {
        const info = LANDS[land];
        const ready = info.board !== null;
        const afford = wallet.points >= info.price;
        return (
          <div key={land} className="flex items-center gap-3 rounded-3xl border-4 border-[#FBD000] bg-white p-3" data-testid={`land-${land}`}>
            {pic(LAND_ICONS[land], "size-20 shrink-0")}
            <span className="flex flex-1 flex-col">
              <span className="text-lg font-black">{t(LAND_NAMES[land])}</span>
              <span className="text-xs font-bold text-[#3B5BA9]">{t(LAND_NOTES[land])}</span>
              <span className="text-xs font-bold text-[#3B5BA9]">{t("{n} 格 · {s} 個建造位", { n: info.squares, s: info.slots })}</span>
            </span>
            <button
              type="button"
              disabled={!ready || !afford}
              onClick={() => {
                play("build");
                juice("large");
                onBuy(land);
              }}
              className="flex min-w-20 cursor-pointer flex-col items-center rounded-2xl border-[3px] border-[#FBD000] bg-[#E52521] px-2 py-1 font-black text-white disabled:cursor-default disabled:border-[#D6DEEA] disabled:bg-[#9CA3AF]"
              data-testid={`buy-${land}`}
            >
              {ready ? (
                <>
                  <span>{t("買地")}</span>
                  <span className="text-xs">
                    <img src={ENERGY_ICON} alt="" className="inline size-4 align-[-3px]" /> {formatEnergy(tableEnergy(info.price))}
                  </span>
                </>
              ) : (
                <span className="text-xs">{t("即將推出")}</span>
              )}
            </button>
          </div>
        );
      })}
    </section>
  );
}

/** Everyone's land that is open: ticket and fewest players shown on each. */
function RealmList({ realm, wallet, onJoin, onMine }: { realm: Realm; wallet: Wallet; onJoin: (listing: Listing) => void; onMine: () => void }) {
  const { t } = useLang();
  const card = (key: string, owner: string, land: Realm, action: ReactNode, mine = false) => (
    <div key={key} className={cn("flex items-center gap-3 rounded-3xl border-4 bg-white p-3", mine ? "border-[#8B5CF6]" : "border-[#FBD000]")}>
      {land.land ? pic(LAND_ICONS[land.land], "size-16 shrink-0") : <span className="text-4xl">🌱</span>}
      <span className="flex flex-1 flex-col">
        <span className="font-black">{t("{owner} 嘅{land}", { owner: t(owner), land: land.land ? t(LAND_NAMES[land.land]) : "" })}</span>
        <span className="text-xs font-bold text-[#3B5BA9]">
          {land.ticket === 0 ? t("免費入場") : t("門票 {n}", { n: formatEnergy(tableEnergy(land.ticket)) })} · {t("最少 {n} 人開局", { n: land.minPlayers })}
        </span>
        <span className="text-sm">{land.slots.map((kind, i) => (kind ? <span key={i}>{pic(ICONS[kind], "size-6")}</span> : null))}</span>
      </span>
      {action}
    </div>
  );
  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-3" data-testid="realm-list">
      {realm.land
        ? card(
            "mine",
            "你",
            realm,
            <button type="button" onClick={onMine} className="cursor-pointer rounded-2xl border-[3px] border-[#8B5CF6] px-3 py-2 text-sm font-black">
              {t("管理")}
            </button>,
            true,
          )
        : null}
      {LISTINGS.map((listing) =>
        card(
          listing.id,
          listing.owner,
          listing.realm,
          <button
            type="button"
            disabled={wallet.points < listing.realm.ticket}
            onClick={() => onJoin(listing)}
            className="flex min-w-16 cursor-pointer flex-col items-center rounded-2xl border-[3px] border-[#FBD000] bg-[#22A447] px-2 py-1 font-black text-white disabled:cursor-default disabled:bg-[#9CA3AF]"
            data-testid={`join-${listing.id}`}
          >
            <span>{t("入場")}</span>
            <span className="text-xs">
              <img src={ENERGY_ICON} alt="" className="inline size-4 align-[-3px]" /> {formatEnergy(tableEnergy(listing.realm.ticket))}
            </span>
          </button>,
        ),
      )}
      <p className="text-center text-xs font-bold text-white/80">{t("練習版：地主同客人都係電腦")}</p>
    </section>
  );
}

type Panel = "build" | "shop" | "rules";

/**
 * Your land (re-laid out with Sky 2026-10-01): the island floats in space with its build spots on a row over
 * it; underneath, three tabs (起樓 / 材料店 / 開局設定) instead of one long scroll; 開局 always in reach.
 */
function RealmEditor({
  realm,
  wallet,
  onChange,
  onHost,
}: {
  realm: Realm;
  wallet: Wallet;
  onChange: (next: { realm?: Realm; wallet?: Wallet }) => void;
  onHost: () => void;
}) {
  const { t } = useLang();
  const [picking, setPicking] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>("build");
  const [sheetOpen, setSheetOpen] = useState(false);
  const dragFrom = useRef<number | null>(null);
  // 商店 房屋券 (Sky 2026-10-08): a voucher builds its house without materials.
  const [vouchers, setVouchers] = useState<Partial<Record<BuildingKind, number>>>({});
  useEffect(() => {
    const id = window.setTimeout(() => setVouchers(loadCollection().vouchers), 0);
    return () => window.clearTimeout(id);
  }, []);

  const describe = (kind: BuildingKind) =>
    ({
      facade: t("只改外觀：金色屋頂"),
      table: t("同時多開一張枱"),
      rent:
        boardOf(realm) === "clover"
          ? t("地主關卡過路費加 {n} 能量", { n: formatEnergy(tableEnergy(1)) })
          : t("客人踩中要交租俾你（{n} 能量）", { n: formatEnergy(tableEnergy(HOUSE_RENT)) }),
      station: t("每人少 {n} 轉，打得快啲", { n: STATION_TURNS }),
      chance: t("揀用邊套機會卡"),
    })[kind];
  const recipe = (kind: BuildingKind) =>
    MATERIALS.filter((m) => RECIPES[kind][m] > 0).map((m) => (
      <span key={m} className="mr-1.5 inline-flex items-center">
        {pic(MATERIAL_ICONS[m], "size-5")}
        {RECIPES[kind][m]}
      </span>
    ));
  const firstEmpty = realm.slots.findIndex((kind) => !kind);

  /** One building to choose: picture, what it does, what it costs. Builds into `slot`. */
  const option = (kind: BuildingKind, slot: number | null, after?: () => void) => {
    // Swapping (Sky 2026-10-01): a spot that already has a building is cleared first, then built again.
    const base = slot !== null && slot >= 0 && realm.slots[slot] ? demolish(realm, slot) : realm;
    const same = slot !== null && slot >= 0 && realm.slots[slot] === kind;
    const fits = canPlace(base, kind) && !same;
    const voucher = (vouchers[kind] ?? 0) > 0;
    const enough = voucher || hasStock(wallet.stock, RECIPES[kind]);
    const ok = fits && enough && slot !== null && slot >= 0;
    return (
      <button
        key={kind}
        type="button"
        disabled={!ok}
        onClick={() => {
          if (!ok) return;
          play("build");
          juice("medium");
          if (voucher) {
            // Pay with the voucher: lend the recipe to the wallet so building takes it straight back out.
            const lent = { ...wallet, stock: { ...wallet.stock } };
            for (const m of MATERIALS) lent.stock[m] += RECIPES[kind][m];
            onChange(build(base, lent, slot, kind));
            const col = loadCollection();
            const left = Math.max(0, (col.vouchers[kind] ?? 0) - 1);
            saveCollection({ ...col, vouchers: { ...col.vouchers, [kind]: left } });
            setVouchers((v) => ({ ...v, [kind]: left }));
          } else onChange(build(base, wallet, slot, kind));
          after?.();
        }}
        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-[3px] border-[#FBD000] bg-[#FFF8D6] px-3 py-1.5 text-left disabled:cursor-default disabled:border-[#E5EAF2] disabled:bg-[#F4F6FA] disabled:opacity-70"
        data-testid={`option-${kind}`}
      >
        {pic(ICONS[kind], "size-12 shrink-0")}
        <span className="flex flex-1 flex-col">
          <span className="font-black">{t(NAMES[kind])}</span>
          <span className="text-xs font-bold text-[#3B5BA9]">
            {same ? t("而家起緊呢款") : !fits ? t("已經到上限") : !enough ? t("材料唔夠") : slot === null || slot < 0 ? t("冇空位，拆走一間先") : describe(kind)}
          </span>
        </span>
        <span className="text-right text-xs font-black text-[#B45309]">{voucher ? t("用房屋券（{n} 張）", { n: vouchers[kind] ?? 0 }) : recipe(kind)}</span>
      </button>
    );
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      {/* Sky (2026-10-09): only space and your painted islands; swipe between them. */}
      <div className="relative min-h-44 flex-1">
        <IslandHome />
      </div>

      {/* Sky (2026-10-08): the build spots sit in a row on top of the sheet, and the sheet's lower part can be
          pulled down out of the way (tap or drag the handle) and pulled back up. */}
      <div
        className={cn(
          "mx-auto flex w-full max-w-xl shrink-0 flex-col gap-2 px-4 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.75rem)]",
          // Closed (Sky 2026-10-08): no white box at all, the space shows through; just a pull-up tab and 開局.
          sheetOpen ? "rounded-t-[32px] bg-white/95" : "bg-transparent",
        )}
        onPointerDown={(e: { clientY: number }) => (dragFrom.current = e.clientY)}
        onPointerUp={(e: { clientY: number }) => {
          if (dragFrom.current === null) return;
          const dy = e.clientY - dragFrom.current;
          dragFrom.current = null;
          if (dy > 30) setSheetOpen(false);
          else if (dy < -30) setSheetOpen(true);
        }}
      >
        {sheetOpen ? (
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="mx-auto flex h-6 w-28 cursor-pointer items-center justify-center gap-1 text-xs font-black text-[#94A3B8]"
            aria-label={t("收埋")}
            data-testid="sheet-handle"
          >
            <span className="h-1.5 w-12 rounded-full bg-[#C7D2E5]" /> ▼
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mx-auto flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 border-[#FBD000] bg-[#7C3AED]/85 px-5 text-sm font-black text-white shadow-lg backdrop-blur animate-[breathe_3s_ease-in-out_infinite]"
            aria-label={t("打開")}
            data-testid="sheet-handle"
          >
            ▲ {t("起樓・材料店・開局設定")}
          </button>
        )}
        {sheetOpen ? <div className="flex justify-center gap-2" data-testid="slots">
          {realm.slots.map((kind, slot) =>
            kind ? (
              <button
                key={slot}
                type="button"
                onClick={() => setPicking(slot)}
                className="flex size-14 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-[#FBD000] bg-[#FFF8D6] shadow-md"
                aria-label={t("換走或者拆咗{b}", { b: t(NAMES[kind]) })}
                data-testid={`slot-${slot}`}
              >
                {pic(ICONS[kind], "size-9")}
                <span className="text-[10px] font-black leading-none">{t(NAMES[kind])}</span>
              </button>
            ) : (
              <button
                key={slot}
                type="button"
                onClick={() => {
                  setPicking(slot);
                }}
                className="flex size-14 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#7C3AED] bg-[#F3EEFF] font-black text-[#7C3AED] shadow-md animate-[breathe_3s_ease-in-out_infinite]"
                aria-label={t("喺第 {n} 個位起嘢", { n: slot + 1 })}
                data-testid={`slot-${slot}`}
              >
                <img src="/art/ui/build.webp" alt="" className="size-7 object-contain" />
                <span className="text-[11px] leading-none">{t("起樓")}</span>
              </button>
            ),
          )}
        </div> : null}
        {sheetOpen ? (
        <>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-[#EEF2FA] p-1" role="tablist">
          {(
            [
              ["build", "起樓"],
              ["shop", "材料店"],
              ["rules", "開局設定"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={panel === id}
              onClick={() => setPanel(id)}
              className={cn("cursor-pointer rounded-full py-1.5 text-sm font-black", panel === id ? "bg-[#7C3AED] text-white shadow" : "text-[#3B5BA9]")}
              data-testid={`panel-${id}`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        <div className="h-[26dvh] max-h-64 min-h-40 space-y-2 overflow-y-auto">
          {panel === "build" ? (
            <>
              {BUILDING_KINDS.map((kind) => option(kind, firstEmpty))}
              <p className="text-center text-xs font-bold text-[#3B5BA9]">{t("撳上面已起嘅建築可以換款或者拆走")}</p>
            </>
          ) : panel === "shop" ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {MATERIALS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={wallet.points < MATERIAL_PRICE[m]}
                    onClick={() => {
                      play("coin");
                      juiceAt("small", document.querySelector(`[data-testid="shop-${m}"]`));
                      onChange({ wallet: buyMaterial(wallet, m) });
                    }}
                    className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-[#FBD000] bg-[#FFF8D6] py-2 font-black disabled:opacity-50"
                    aria-label={t("買一件{m}，{n} 能量", { m: t(MATERIAL_NAMES[m]), n: formatEnergy(tableEnergy(MATERIAL_PRICE[m])) })}
                    data-testid={`shop-${m}`}
                  >
                    {pic(MATERIAL_ICONS[m], "size-14")}
                    <span className="text-sm">{t(MATERIAL_NAMES[m])}</span>
                    <span className="text-xs text-[#B45309]">
                      <img src={ENERGY_ICON} alt="" className="inline size-4 align-[-3px]" /> {formatEnergy(tableEnergy(MATERIAL_PRICE[m]))}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-center text-xs font-bold text-[#3B5BA9]">{t("玩公開桌，名次越前送越多材料")}</p>
            </>
          ) : (
            <>
              <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm font-black" data-testid="realm-summary">
                <span>{t("同時開 {n} 張枱", { n: tablesOf(realm) })}</span>
                <span>{t("每人 {n} 轉", { n: turnsOf(realm) })}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Stepper
                  label={t("門票")}
                  value={realm.ticket}
                  shown={formatEnergy(tableEnergy(realm.ticket))}
                  note={realm.ticket === 0 ? t("0 = 免費場") : t("最多 {n}", { n: formatEnergy(tableEnergy(MAX_TICKET)) })}
                  onDown={() => onChange({ realm: setTicket(realm, realm.ticket - 1) })}
                  onUp={() => onChange({ realm: setTicket(realm, realm.ticket + 1) })}
                  testid="ticket"
                />
                <Stepper
                  label={t("最少人數")}
                  value={realm.minPlayers}
                  note={t("{a} 至 {b} 人", { a: MIN_PLAYERS, b: MAX_PLAYERS })}
                  onDown={() => onChange({ realm: setMinPlayers(realm, realm.minPlayers - 1) })}
                  onUp={() => onChange({ realm: setMinPlayers(realm, realm.minPlayers + 1) })}
                  testid="min-players"
                />
              </div>
              {count(realm, "chance") > 0 ? (
                <div className="space-y-1">
                  <p className="text-center text-xs font-black">{t("機會卡")}</p>
                  <div className="flex items-center justify-center gap-2" role="group" aria-label={t("機會卡")}>
                    {(Object.keys(DECK_NAMES) as DeckId[]).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onChange({ realm: { ...realm, deck: id } })}
                        aria-pressed={realm.deck === id}
                        className={cn(
                          "cursor-pointer rounded-full border-2 px-3 py-1 text-sm font-black",
                          realm.deck === id ? "border-[#FBD000] bg-[#8B5CF6] text-white" : "border-[#D6DEEA] bg-white",
                        )}
                      >
                        {t(DECK_NAMES[id])}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs font-bold text-[#3B5BA9]">{t("起咗機會屋就可以揀機會卡")}</p>
              )}
            </>
          )}
        </div>
        </>
        ) : null}

        <button
          type="button"
          onClick={() => {
            play("coin");
            onHost();
          }}
          className="h-14 w-full shrink-0 cursor-pointer rounded-full border-4 border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-xl font-black text-white shadow-[0_5px_0_#8E1210] active:translate-y-1"
          data-testid="host"
        >
          {t("開局")}
        </button>
      </div>

      {/* Tapping an empty spot: pick what to build there. */}
      {picking !== null ? (
        <div className="absolute inset-0 z-40 flex items-end bg-[#1E3A8A]/50" onClick={() => setPicking(null)}>
          <div
            className="w-full space-y-2 rounded-t-[32px] bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            data-testid="build-picker"
          >
            <p className="text-center font-black">{realm.slots[picking] ? t("換做第二款") : t("揀要起邊款")}</p>
            {BUILDING_KINDS.map((kind) => option(kind, picking, () => setPicking(null)))}
            {realm.slots[picking] ? (
              <button
                type="button"
                onClick={() => {
                  onChange({ realm: demolish(realm, picking) });
                  setPicking(null);
                }}
                className="w-full cursor-pointer rounded-full border-2 border-[#E52521] py-2 text-sm font-black text-[#E52521]"
                data-testid="demolish"
              >
                {t("拆走（材料唔退返）")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stepper({
  label,
  value,
  shown,
  note,
  onDown,
  onUp,
  testid,
}: {
  label: string;
  value: number;
  /** What to show instead of the raw value (e.g. the ticket as 能量). */
  shown?: string;
  note: string;
  onDown: () => void;
  onUp: () => void;
  testid: string;
}) {
  const { t } = useLang();
  return (
    <div className="rounded-2xl bg-[#EAF4FF] px-2 py-1.5 text-center font-black">
      <p className="text-xs">{label}</p>
      <div className="mt-0.5 flex items-center justify-center gap-2">
        <button type="button" onClick={onDown} className="size-8 cursor-pointer rounded-full border-2 border-[#FBD000] bg-white text-lg leading-none" aria-label={t("{x}減一", { x: label })}>
          −
        </button>
        <span className={cn("min-w-7 tabular-nums", (shown ?? String(value)).length > 4 ? "text-base" : "text-xl")} data-testid={testid}>
          {shown ?? value}
        </span>
        <button type="button" onClick={onUp} className="size-8 cursor-pointer rounded-full border-2 border-[#FBD000] bg-white text-lg leading-none" aria-label={t("{x}加一", { x: label })}>
          +
        </button>
      </div>
      <p className="text-[10px] font-bold text-[#3B5BA9]">{note}</p>
    </div>
  );
}
