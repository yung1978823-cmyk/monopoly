"use client";

import { createBoardScene, loadThree, type BoardScene, type Decor } from "@/components/eight-scene";
import { CAST, EightBoard } from "@/components/table-game";
import { useLang } from "@/lib/i18n";
import {
  BUILD_COST,
  BUILDING_KINDS,
  HOUSE_RENT,
  MAX_TICKET,
  REALM_KEY,
  SIZES,
  STATION_TURNS,
  build,
  buildCost,
  canBuild,
  count,
  demolish,
  housesOf,
  newRealm,
  parseRealm,
  resize,
  rulesOf,
  setTicket,
  tablesOf,
  turnsOf,
  type BuildingKind,
  type DeckId,
  type Realm,
  type RealmSize,
} from "@/lib/realm";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

const ICONS: Record<BuildingKind, string> = { facade: "🎨", table: "🪑", rent: "🏠", station: "🚉", chance: "❓" };
const NAMES: Record<BuildingKind, string> = { facade: "門面", table: "加枱", rent: "租金屋", station: "車站", chance: "機會屋" };
const SIZE_NAMES: Record<RealmSize, string> = { small: "小", medium: "中", large: "大" };
const DECK_NAMES: Record<DeckId, string> = { standard: "標準", wild: "大起大落", calm: "平穩" };

function decorOf(realm: Realm): Decor {
  return { houses: housesOf(realm), facade: count(realm, "facade") > 0, stations: count(realm, "station") };
}

function loadRealm(): Realm {
  try {
    const saved = localStorage.getItem(REALM_KEY);
    return saved ? parseRealm(JSON.parse(saved)) : newRealm();
  } catch {
    return newRealm();
  }
}

/** 第三層 領地 (practice): build your realm on the 八字 board, set a ticket, host computer guests. */
export function RealmScreen({ onExit }: { onExit: () => void }) {
  const [realm, setRealm] = useState<Realm>(() => newRealm());
  const [hosting, setHosting] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setRealm(loadRealm()), 0);
    return () => window.clearTimeout(id);
  }, []);
  const update = (next: Realm) => {
    setRealm(next);
    try {
      localStorage.setItem(REALM_KEY, JSON.stringify(next));
    } catch {
      // Not remembered on this device.
    }
  };

  if (hosting !== null) {
    return (
      <EightBoard
        key={hosting}
        players={CAST.slice(1)}
        rules={rulesOf(realm)}
        decor={decorOf(realm)}
        realm={realm}
        onExit={() => setHosting(null)}
        onAgain={() => setHosting(Date.now())}
      />
    );
  }
  return <RealmEditor realm={realm} onChange={update} onExit={onExit} onHost={() => setHosting(Date.now())} />;
}

function RealmEditor({ realm, onChange, onExit, onHost }: { realm: Realm; onChange: (realm: Realm) => void; onExit: () => void; onHost: () => void }) {
  const { t } = useLang();
  const mount = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [picking, setPicking] = useState<number | null>(null);
  const realmRef = useRef(realm);
  realmRef.current = realm;

  // The board preview, with the buildings on it.
  useEffect(() => {
    let cancelled = false;
    let scene: BoardScene | null = null;
    loadThree()
      .then((T) => {
        if (cancelled || !mount.current) return;
        scene = createBoardScene(T, mount.current, [], decorOf(realmRef.current));
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

  const size = SIZES[realm.size];
  const describe = (kind: BuildingKind) =>
    ({
      facade: t("只改外觀：金色屋頂"),
      table: t("同時多開一張枱"),
      rent: t("客人踩中要交租俾你（{n}）", { n: HOUSE_RENT }),
      station: t("每人少 {n} 轉，打得快啲", { n: STATION_TURNS }),
      chance: t("揀用邊套機會卡"),
    })[kind];

  return (
    <main className="relative h-dvh w-full touch-none select-none overflow-hidden bg-[#3B1D6E] text-[#1E3A8A]" data-testid="realm">
      <div ref={mount} className="absolute inset-x-0 top-0 h-[55%]" aria-label={t("我嘅領地")} />
      {loaded !== "ready" ? (
        <p className="absolute inset-x-0 top-[25%] text-center font-black text-white">
          {loaded === "loading" ? t("載入立體棋盤⋯") : t("立體畫面載入唔到，請檢查網絡再試。")}
        </p>
      ) : null}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-xl items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.6rem)]">
        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-xl font-black text-white shadow-md"
          aria-label={t("返回")}
        >
          ←
        </button>
        <h1 className="flex-1 text-center text-2xl font-black text-white drop-shadow-[0_3px_0_#1E3A8A]">{t("🏰 我嘅領地")}</h1>
        <span className="rounded-full bg-[#FBD000] px-2 py-0.5 text-xs font-black">{t("練習版")}</span>
      </header>

      <section className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-h-[52%] max-w-xl flex-col gap-3 overflow-y-auto rounded-t-[32px] bg-white/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-6px_20px_rgba(30,58,138,0.25)] touch-pan-y">
        {/* Size. */}
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("規模")}>
          {(Object.keys(SIZES) as RealmSize[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(resize(realm, id))}
              aria-pressed={realm.size === id}
              className={cn(
                "flex cursor-pointer flex-col items-center rounded-2xl border-[3px] py-1.5 font-black",
                realm.size === id ? "border-[#FBD000] bg-[#E52521] text-white" : "border-[#D6DEEA] bg-white",
              )}
              data-testid={`size-${id}`}
            >
              <span className="text-lg">{t(SIZE_NAMES[id])}</span>
              <span className="text-[11px]">{t("{t} 枱 · {s} 個建造位", { t: SIZES[id].tables, s: SIZES[id].slots })}</span>
            </button>
          ))}
        </div>

        {/* Build slots. */}
        <div className={cn("grid gap-2", size.slots > 4 ? "grid-cols-6" : size.slots > 2 ? "grid-cols-4" : "grid-cols-2")}>
          {realm.slots.map((kind, slot) =>
            kind ? (
              <button
                key={slot}
                type="button"
                onClick={() => onChange(demolish(realm, slot))}
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

        <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs font-black" data-testid="realm-summary">
          <span>{t("同時開 {n} 張枱", { n: tablesOf(realm) })}</span>
          <span>{t("每人 {n} 轉", { n: turnsOf(realm) })}</span>
          <span>{t("總造價 {n}（臨時）", { n: buildCost(realm) })}</span>
        </p>

        {count(realm, "chance") > 0 ? (
          <div className="flex items-center justify-center gap-2" role="group" aria-label={t("機會卡")}>
            {(Object.keys(DECK_NAMES) as DeckId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ ...realm, deck: id })}
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

        {/* Ticket. */}
        <div className="flex items-center gap-3 rounded-2xl bg-[#EAF4FF] px-3 py-2 font-black">
          <span className="text-sm">{t("門票")}</span>
          <button
            type="button"
            onClick={() => onChange(setTicket(realm, realm.ticket - 1))}
            className="size-9 cursor-pointer rounded-full border-2 border-[#FBD000] bg-white text-xl"
            aria-label={t("門票減一")}
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={MAX_TICKET}
            value={realm.ticket}
            onChange={(event: { currentTarget: { value: string } }) => onChange(setTicket(realm, Number(event.currentTarget.value)))}
            className="min-w-0 flex-1 accent-[#E52521]"
            aria-label={t("門票")}
          />
          <button
            type="button"
            onClick={() => onChange(setTicket(realm, realm.ticket + 1))}
            className="size-9 cursor-pointer rounded-full border-2 border-[#FBD000] bg-white text-xl"
            aria-label={t("門票加一")}
          >
            +
          </button>
          <span className="w-8 text-right text-xl tabular-nums" data-testid="ticket">
            {realm.ticket}
          </span>
        </div>
        <p className="-mt-2 text-center text-[11px] font-bold text-[#3B5BA9]">
          {realm.ticket === 0 ? t("0 = 免費場，分數局") : t("最多 {n}，同公開桌入場一樣", { n: MAX_TICKET })}
        </p>

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
      </section>

      {/* Pick what to build in a slot. */}
      {picking !== null ? (
        <div className="absolute inset-0 z-40 flex items-end bg-[#1E3A8A]/50" onClick={() => setPicking(null)}>
          <div
            className="w-full space-y-2 rounded-t-[32px] bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            data-testid="build-picker"
          >
            {BUILDING_KINDS.map((kind) => {
              const ok = canBuild(realm, kind);
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={!ok}
                  onClick={() => {
                    play("build");
                    onChange(build(realm, picking, kind));
                    setPicking(null);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-[3px] border-[#FBD000] bg-[#FFF8D6] px-3 py-2 text-left disabled:cursor-default disabled:border-[#E5EAF2] disabled:bg-[#F4F6FA] disabled:opacity-60"
                >
                  <span className="text-3xl">{ICONS[kind]}</span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-black">{t(NAMES[kind])}</span>
                    <span className="text-xs font-bold text-[#3B5BA9]">{ok ? describe(kind) : t("已經到上限")}</span>
                  </span>
                  <span className="text-xs font-black text-[#B45309]">{t("臨時 {n}", { n: BUILD_COST[kind] })}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </main>
  );
}
