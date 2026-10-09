"use client";

import { type Decor } from "@/components/eight-scene";
import { IslandHome } from "@/components/island-home";
import { CAST, EightBoard } from "@/components/table-game";
import { loadWallet, saveWallet } from "@/components/wallet-store";
import { ENERGY_ICON, formatEnergy, tableEnergy } from "@/lib/energy";
import { useLang } from "@/lib/i18n";
import {
  LISTINGS,
  MAX_PLAYERS,
  MAX_TICKET,
  MIN_PLAYERS,
  REALM_KEY,
  boardOf,
  count,
  emptyRealm,
  housesOf,
  parseRealm,
  rulesOf,
  setMinPlayers,
  setTicket,
  tablesOf,
  turnsOf,
  type BuildingKind,
  type LandKind,
  type Listing,
  type Realm,
  type Wallet,
} from "@/lib/realm";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useEffect, useState, type ReactNode } from "react";

/** Sky's drawn pictures (2026-10-01) for lands, materials and buildings, in place of emoji. */
const pic = (name: string, className: string) => <img src={`/art/realm/${name}.webp`} alt="" draggable={false} className={cn("inline-block object-contain", className)} />;
const ICONS: Record<BuildingKind, string> = { table: "table", rent: "rent", station: "station" };
const LAND_ICONS: Record<LandKind, string> = { island: "island", mountain: "mountain", volcano: "volcano" };
const LAND_NAMES: Record<LandKind, string> = { island: "海島", mountain: "山城", volcano: "火山" };

function decorOf(realm: Realm): Decor {
  return { houses: housesOf(realm), facade: false, stations: count(realm, "station") };
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
        {tab === "list" ? <WalletBar wallet={wallet} /> : null}
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
      ) : (
        <RealmEditor realm={realm} onChange={update} onHost={() => setGame({ id: Date.now(), kind: "host" })} />
      )}
    </main>
  );
}

function WalletBar({ wallet }: { wallet: Wallet }) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm font-black tabular-nums" aria-label={t("能量")} data-testid="wallet">
      <span>
        <img src={ENERGY_ICON} alt={t("能量")} className="inline size-4 align-[-3px]" /> {formatEnergy(tableEnergy(wallet.points))}
      </span>
    </div>
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

/**
 * 我嘅領地 (Sky 2026-10-09): the whole screen is your painted island; no build sheet, no materials. 開局 floats at
 * the bottom and opens the game setup (門票, 最少人數) before the game starts.
 */
function RealmEditor({
  realm,
  onChange,
  onHost,
}: {
  realm: Realm;
  onChange: (next: { realm?: Realm; wallet?: Wallet }) => void;
  onHost: () => void;
}) {
  const { t } = useLang();
  const [setup, setSetup] = useState(false);
  return (
    <section className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <IslandHome />
      </div>
      <div className="mx-auto w-full max-w-xl shrink-0 px-6 pt-1 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <button
          type="button"
          onClick={() => {
            play("coin");
            setSetup(true);
          }}
          className="h-12 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-lg font-black text-white shadow-[0_5px_0_#8E1210] active:translate-y-1"
          data-testid="host"
        >
          {t("開局")}
        </button>
      </div>
      {setup ? (
        <div className="absolute inset-0 z-40 flex items-end bg-[#1E3A8A]/50" onClick={() => setSetup(false)}>
          <div
            className="w-full space-y-3 rounded-t-[32px] bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            data-testid="host-setup"
          >
            <p className="text-center text-lg font-black">{t("開局設定")}</p>
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
            </>
            <button
              type="button"
              onClick={() => {
                play("coin");
                setSetup(false);
                onHost();
              }}
              className="h-14 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-gradient-to-b from-[#F0403C] to-[#C21B17] text-xl font-black text-white shadow-[0_5px_0_#8E1210] active:translate-y-1"
              data-testid="host-start"
            >
              {t("開始")}
            </button>
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
