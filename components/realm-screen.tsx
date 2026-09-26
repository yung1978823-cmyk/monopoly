"use client";

import { createBoardScene, loadThree, type BoardScene, type Decor } from "@/components/eight-scene";
import { CAST, EightBoard } from "@/components/table-game";
import { loadWallet, saveWallet } from "@/components/wallet-store";
import { useLang } from "@/lib/i18n";
import {
  BUILDING_KINDS,
  HOUSE_RENT,
  LANDS,
  LAND_KINDS,
  LAND_TAX,
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
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useEffect, useRef, useState, type ReactNode } from "react";

const ICONS: Record<BuildingKind, string> = { facade: "🎨", table: "🪑", rent: "🏠", station: "🚉", chance: "❓" };
const NAMES: Record<BuildingKind, string> = { facade: "門面", table: "加枱", rent: "租金屋", station: "車站", chance: "機會屋" };
const LAND_ICONS: Record<LandKind, string> = { island: "🏝️", mountain: "⛰️", volcano: "🌋" };
const LAND_NAMES: Record<LandKind, string> = { island: "海島", mountain: "山城", volcano: "火山" };
const LAND_NOTES: Record<LandKind, string> = {
  island: "圓形小島，中間有燈塔，碼頭可以坐船",
  mountain: "之字山路，上山落山，有纜車",
  volcano: "外圈加內圈兩層，用橋連接",
};
const MATERIAL_ICONS: Record<Material, string> = { wood: "🪵", stone: "🧱", gold: "🪙" };
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
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#3B1D6E] text-[#1E3A8A]" data-testid="realm">
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
          <h1 className="flex-1 text-center text-2xl font-black text-white drop-shadow-[0_3px_0_#1E3A8A]">{t("🏰 領地")}</h1>
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
    <div className="flex items-center justify-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm font-black tabular-nums" aria-label={t("我嘅錢同材料")} data-testid="wallet">
      <span>💰 {wallet.points}</span>
      {MATERIALS.map((m) => (
        <span key={m}>
          {MATERIAL_ICONS[m]} {wallet.stock[m]}
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
            <span className="text-5xl">{LAND_ICONS[land]}</span>
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
                onBuy(land);
              }}
              className="flex min-w-20 cursor-pointer flex-col items-center rounded-2xl border-[3px] border-[#FBD000] bg-[#E52521] px-2 py-1 font-black text-white disabled:cursor-default disabled:border-[#D6DEEA] disabled:bg-[#9CA3AF]"
              data-testid={`buy-${land}`}
            >
              {ready ? (
                <>
                  <span>{t("買地")}</span>
                  <span className="text-xs">{t("臨時 {n}", { n: info.price })}</span>
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
      <span className="text-4xl">{land.land ? LAND_ICONS[land.land] : "🌱"}</span>
      <span className="flex flex-1 flex-col">
        <span className="font-black">{t("{owner} 嘅{land}", { owner: t(owner), land: land.land ? t(LAND_NAMES[land.land]) : "" })}</span>
        <span className="text-xs font-bold text-[#3B5BA9]">
          {land.ticket === 0 ? t("免費入場") : t("門票 {n}", { n: land.ticket })} · {t("最少 {n} 人開局", { n: land.minPlayers })}
        </span>
        <span className="text-sm">{land.slots.map((kind, i) => (kind ? <span key={i}>{ICONS[kind]}</span> : null))}</span>
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
            <span className="text-xs">💰 {listing.realm.ticket}</span>
          </button>,
        ),
      )}
      <p className="text-center text-xs font-bold text-white/80">{t("練習版：地主同客人都係電腦")}</p>
    </section>
  );
}

/** Your land: 3D preview, build slots (paid in materials), the material shop, ticket and players. */
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
  const mount = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [picking, setPicking] = useState<number | null>(null);
  const realmRef = useRef(realm);
  realmRef.current = realm;

  useEffect(() => {
    let cancelled = false;
    let scene: BoardScene | null = null;
    loadThree()
      .then((T) => {
        if (cancelled || !mount.current) return;
        scene = createBoardScene(T, mount.current, [], decorOf(realmRef.current), boardOf(realmRef.current));
        sceneRef.current = scene;
        scene.focus(null);
        setLoaded("ready");
      })
      .catch(() => {
        if (!cancelled) setLoaded("failed");
      });
    return () => {
      cancelled = true;
      sceneRef.current = null;
      scene?.dispose();
    };
  }, []);
  useEffect(() => {
    sceneRef.current?.setDecor(decorOf(realm));
  }, [realm, loaded]);

  const describe = (kind: BuildingKind) =>
    ({
      facade: t("只改外觀：金色屋頂"),
      table: t("同時多開一張枱"),
      rent: t("客人踩中要交租俾你（{n}）", { n: HOUSE_RENT }),
      station: t("每人少 {n} 轉，打得快啲", { n: STATION_TURNS }),
      chance: t("揀用邊套機會卡"),
    })[kind];
  const recipe = (kind: BuildingKind) =>
    MATERIALS.filter((m) => RECIPES[kind][m] > 0).map((m) => `${MATERIAL_ICONS[m]}${RECIPES[kind][m]}`).join(" ");
  const land = realm.land!;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      <div ref={mount} className="relative h-[38%] min-h-40 w-full touch-none" aria-label={t("我嘅領地")}>
        {loaded !== "ready" ? (
          <p className="absolute inset-x-0 top-1/3 text-center font-black text-white">
            {loaded === "loading" ? t("載入立體棋盤⋯") : t("立體畫面載入唔到，請檢查網絡再試。")}
          </p>
        ) : null}
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto rounded-t-[32px] bg-white/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <p className="text-center text-lg font-black">
          {LAND_ICONS[land]} {t("我嘅{land}", { land: t(LAND_NAMES[land]) })}
        </p>

        {/* Build slots. */}
        <div className={cn("grid gap-2", realm.slots.length > 4 ? "grid-cols-6" : realm.slots.length > 2 ? "grid-cols-4" : "grid-cols-2")}>
          {realm.slots.map((kind, slot) =>
            kind ? (
              <button
                key={slot}
                type="button"
                onClick={() => onChange({ realm: demolish(realm, slot) })}
                className="relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border-[3px] border-[#FBD000] bg-[#F3EEFF] text-2xl"
                aria-label={t("拆咗{b}", { b: t(NAMES[kind]) })}
                data-testid={`slot-${slot}`}
              >
                {ICONS[kind]}
                <span className="text-[10px] font-black leading-tight">{t(NAMES[kind])}</span>
                <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-black shadow">✕</span>
              </button>
            ) : (
              <button
                key={slot}
                type="button"
                onClick={() => setPicking(slot)}
                className="flex aspect-square cursor-pointer items-center justify-center rounded-2xl border-[3px] border-dashed border-[#8B5CF6]/50 bg-[#F3EEFF] text-2xl font-black text-[#8B5CF6]/60"
                aria-label={t("喺第 {n} 個位起嘢", { n: slot + 1 })}
                data-testid={`slot-${slot}`}
              >
                +
              </button>
            ),
          )}
        </div>
        <p className="-mt-1 text-center text-[11px] font-bold text-[#3B5BA9]">{t("拆咗嘅建築唔會退返材料")}</p>

        {/* Material shop. */}
        <div className="rounded-2xl bg-[#FFF8D6] p-2">
          <p className="mb-1 text-center text-sm font-black">{t("材料店（臨時價，買材料嘅錢會銷毀）")}</p>
          <div className="grid grid-cols-3 gap-2">
            {MATERIALS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={wallet.points < MATERIAL_PRICE[m]}
                onClick={() => {
                  play("coin");
                  onChange({ wallet: buyMaterial(wallet, m) });
                }}
                className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-[#FBD000] bg-white py-1 font-black disabled:opacity-50"
                aria-label={t("買一件{m}，{n} 分", { m: t(MATERIAL_NAMES[m]), n: MATERIAL_PRICE[m] })}
                data-testid={`shop-${m}`}
              >
                <span className="text-2xl">{MATERIAL_ICONS[m]}</span>
                <span className="text-xs">{t(MATERIAL_NAMES[m])}</span>
                <span className="text-xs text-[#B45309]">💰 {MATERIAL_PRICE[m]}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-center text-[11px] font-bold text-[#3B5BA9]">{t("公開桌按名次都會派材料")}</p>
        </div>

        <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs font-black" data-testid="realm-summary">
          <span>{t("同時開 {n} 張枱", { n: tablesOf(realm) })}</span>
          <span>{t("每人 {n} 轉", { n: turnsOf(realm) })}</span>
          <span>{t("地稅 {n}%", { n: LAND_TAX * 100 })}</span>
        </p>

        {count(realm, "chance") > 0 ? (
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
        ) : null}

        {/* Ticket and fewest players. */}
        <Stepper
          label={t("門票")}
          value={realm.ticket}
          note={realm.ticket === 0 ? t("0 = 免費場，分數局") : t("最多 {n}，同公開桌入場一樣", { n: MAX_TICKET })}
          onDown={() => onChange({ realm: setTicket(realm, realm.ticket - 1) })}
          onUp={() => onChange({ realm: setTicket(realm, realm.ticket + 1) })}
          testid="ticket"
        />
        <Stepper
          label={t("最少人數")}
          value={realm.minPlayers}
          note={t("{a} 至 {b} 人，夠人先開局", { a: MIN_PLAYERS, b: MAX_PLAYERS })}
          onDown={() => onChange({ realm: setMinPlayers(realm, realm.minPlayers - 1) })}
          onUp={() => onChange({ realm: setMinPlayers(realm, realm.minPlayers + 1) })}
          testid="min-players"
        />

        <button
          type="button"
          onClick={() => {
            play("coin");
            onHost();
          }}
          className="h-14 w-full shrink-0 cursor-pointer rounded-full border-4 border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-xl font-black text-white shadow-[0_5px_0_#8E1210] active:translate-y-1"
          data-testid="host"
        >
          {t("開局招待（電腦做客人）")}
        </button>
      </div>

      {/* Pick what to build: each needs materials. */}
      {picking !== null ? (
        <div className="absolute inset-0 z-40 flex items-end bg-[#1E3A8A]/50" onClick={() => setPicking(null)}>
          <div
            className="w-full space-y-2 rounded-t-[32px] bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            data-testid="build-picker"
          >
            {BUILDING_KINDS.map((kind) => {
              const fits = canPlace(realm, kind);
              const enough = hasStock(wallet.stock, RECIPES[kind]);
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={!fits || !enough}
                  onClick={() => {
                    play("build");
                    onChange(build(realm, wallet, picking, kind));
                    setPicking(null);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-[3px] border-[#FBD000] bg-[#FFF8D6] px-3 py-2 text-left disabled:cursor-default disabled:border-[#E5EAF2] disabled:bg-[#F4F6FA] disabled:opacity-70"
                >
                  <span className="text-3xl">{ICONS[kind]}</span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-black">{t(NAMES[kind])}</span>
                    <span className="text-xs font-bold text-[#3B5BA9]">
                      {!fits ? t("已經到上限") : !enough ? t("材料唔夠") : describe(kind)}
                    </span>
                  </span>
                  <span className="text-right text-xs font-black text-[#B45309]">
                    {recipe(kind)}
                    <span className="block text-[10px] text-[#3B5BA9]">{t("臨時配方")}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stepper({
  label,
  value,
  note,
  onDown,
  onUp,
  testid,
}: {
  label: string;
  value: number;
  note: string;
  onDown: () => void;
  onUp: () => void;
  testid: string;
}) {
  const { t } = useLang();
  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl bg-[#EAF4FF] px-3 py-2 font-black">
        <span className="flex-1 text-sm">{label}</span>
        <button type="button" onClick={onDown} className="size-9 cursor-pointer rounded-full border-2 border-[#FBD000] bg-white text-xl" aria-label={t("{x}減一", { x: label })}>
          −
        </button>
        <span className="w-8 text-center text-xl tabular-nums" data-testid={testid}>
          {value}
        </span>
        <button type="button" onClick={onUp} className="size-9 cursor-pointer rounded-full border-2 border-[#FBD000] bg-white text-xl" aria-label={t("{x}加一", { x: label })}>
          +
        </button>
      </div>
      <p className="mt-0.5 text-center text-[11px] font-bold text-[#3B5BA9]">{note}</p>
    </div>
  );
}
