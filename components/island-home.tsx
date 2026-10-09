"use client";

import { useLang } from "@/lib/i18n";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

/** A spot on the picture, in the picture's own pixels. */
type At = { x: number; y: number };
type Fall = At & { w: number; h: number };
export type IslandArt = {
  id: string;
  name: string;
  art: string;
  w: number;
  h: number;
  /** Where the castle stands (the middle of the plaza). */
  castle: At;
  /** Sky's dry cliff channels, where code runs the water. */
  falls: Fall[];
  /** 裝飾位: where bought decorations will stand. */
  spots: At[];
};

/**
 * 領地 islands (Sky 2026-10-09): each one a painted island on its own. The first is 森林礦島: castle plaza at the
 * front, quarry up the left, forest at the back, gold mine down the right (18 squares + the castle).
 */
export const ISLANDS: IslandArt[] = [
  {
    id: "forest",
    name: "森林礦島",
    art: "/art/islands/forest.webp",
    w: 941,
    h: 1360,
    castle: { x: 470, y: 925 },
    falls: [
      { x: 451, y: 62, w: 40, h: 86 },
      { x: 60, y: 560, w: 38, h: 175 },
      { x: 866, y: 555, w: 30, h: 175 },
    ],
    spots: [
      { x: 420, y: 290 },
      { x: 540, y: 290 },
      { x: 480, y: 370 },
      { x: 478, y: 600 },
      { x: 245, y: 885 },
      { x: 715, y: 880 },
    ],
  },
];

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/** One island, fitted inside its box without cropping, floating gently. */
function Island({ island, editing }: { island: IslandArt; editing: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const scale = Math.min(width / island.w, height / island.h);
      setSize({ w: island.w * scale, h: island.h * scale });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [island]);
  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      <div className="relative animate-[isle-float_6s_ease-in-out_infinite]" style={{ width: size.w, height: size.h }} data-testid={`island-${island.id}`}>
        <img src={island.art} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
        {island.falls.map((f, i) => (
          <div
            key={i}
            className="absolute overflow-hidden rounded-[45%/12%]"
            style={{ left: pct(f.x, island.w), top: pct(f.y, island.h), width: pct(f.w, island.w), height: pct(f.h, island.h) }}
          >
            <div className="absolute inset-0 animate-[water-flow_1.1s_linear_infinite] bg-[url(/art/islands/water.webp)] bg-[length:100%_96px] opacity-90 [mask-image:linear-gradient(90deg,transparent,#000_25%,#000_75%,transparent)]" />
            <div className="absolute inset-x-0 bottom-0 h-[10%] animate-[foam_1.2s_ease-in-out_infinite] rounded-full bg-white/80 blur-[2px]" />
          </div>
        ))}
        {/* The castle on the plaza: a stand-in until Sky's own castle picture comes. */}
        <img
          src="/art/tiles/clover/plaza.webp"
          alt=""
          draggable={false}
          className="absolute -translate-x-1/2 -translate-y-[82%] drop-shadow-[0_6px_6px_rgba(0,0,0,0.45)]"
          style={{ left: pct(island.castle.x, island.w), top: pct(island.castle.y, island.h), width: "26%" }}
        />
        {editing
          ? island.spots.map((s, i) => (
              <span
                key={i}
                className="absolute flex aspect-square w-[9%] -translate-x-1/2 -translate-y-1/2 animate-[breathe_2.4s_ease-in-out_infinite] items-center justify-center rounded-full border-2 border-dashed border-white bg-[#7C3AED]/45 text-lg font-black text-white shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                style={{ left: pct(s.x, island.w), top: pct(s.y, island.h) }}
                data-testid={`deco-spot-${i}`}
              >
                +
              </span>
            ))
          : null}
      </div>
    </div>
  );
}

/**
 * 我嘅島 (Sky 2026-10-09): just space and your islands; swipe left and right between them. The last page is
 * the next island to buy.
 */
export function IslandHome() {
  const { t } = useLang();
  const strip = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const pages = ISLANDS.length + 1;
  const go = (n: number) => strip.current?.scrollTo({ left: n * strip.current.clientWidth, behavior: "smooth" });

  return (
    <div className="absolute inset-0 flex flex-col" data-testid="island-home">
      <div
        ref={strip}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e: { currentTarget: HTMLDivElement }) => setPage(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        {ISLANDS.map((island) => (
          <section key={island.id} className="relative flex h-full w-full shrink-0 snap-center flex-col px-2 pb-1">
            <p className="mx-auto mt-1 rounded-full border-2 border-[#FBD000] bg-[#1E3A8A]/80 px-4 py-0.5 text-sm font-black text-white shadow">{t(island.name)}</p>
            <div className="min-h-0 flex-1">
              <Island island={island} editing={editing} />
            </div>
          </section>
        ))}
        <section className="flex h-full w-full shrink-0 snap-center flex-col items-center justify-center gap-3 px-6 text-center text-white" data-testid="island-next">
          <img src="/art/islands/forest.webp" alt="" draggable={false} className="max-h-[55%] opacity-30 brightness-0 invert-[0.35]" />
          <p className="text-lg font-black">{t("下一個島")}</p>
          <p className="rounded-full bg-white/20 px-3 py-0.5 text-sm font-bold">{t("即將推出")}</p>
        </section>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-3 pb-1">
        {Array.from({ length: pages }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => go(n)}
            className={cn("size-2.5 cursor-pointer rounded-full", n === page ? "bg-[#FBD000]" : "bg-white/40")}
            aria-label={t("第 {n} 頁", { n: n + 1 })}
          />
        ))}
        {page < ISLANDS.length ? (
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            className={cn(
              "ml-2 cursor-pointer rounded-full border-2 px-3 py-0.5 text-xs font-black shadow",
              editing ? "border-[#FBD000] bg-[#7C3AED] text-white" : "border-white/60 bg-white/85 text-[#1E3A8A]",
            )}
            data-testid="deco-toggle"
          >
            {editing ? t("完成") : t("裝飾位")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
