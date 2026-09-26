import { BOARD_ART, BOARD_CENTRE, FX_ART, TILES, TILE_INFO, TILE_POSITIONS, type TileKind } from "@/lib/board";
import { cn } from "cn";
import type { CSSProperties, ReactNode } from "react";

/** Squares nearer the bottom of the art are drawn larger, so the overlays grow with them. */
function depthScale(y: number): number {
  return 0.88 + (0.28 * (y - 0.09)) / 0.7;
}

/** Tint behind each square's picture. Coins stay bare so the special squares stand out. */
/** A stop's effect: its picture bursts up from the square with the number floating away. */
export type Burst = {
  key: number;
  index: number;
  icon: string;
  /** The drawn picture, when the square has one. */
  art?: string;
  /** e.g. "+2⭐" or "−3⭐"; empty for none. */
  text: string;
  bad: boolean;
};

const TINT: Record<TileKind, string | null> = {
  start: "rgba(251,208,0,0.92)",
  coin: null,
  chest: "rgba(255,140,40,0.9)",
  lucky: "rgba(4,156,216,0.9)",
  attack: "rgba(229,37,33,0.88)",
  jail: "rgba(70,80,110,0.9)",
  tax: "rgba(140,70,160,0.9)",
};

export function BoardRing({
  position,
  centre = null,
  trail = [],
  stopIndex = null,
  burst = null,
  className,
}: {
  position: number;
  /** Shown in the middle of the board, e.g. the dice being rolled. */
  centre?: ReactNode;
  trail?: number[];
  stopIndex?: number | null;
  burst?: Burst | null;
  className?: string;
}) {
  return (
    <div
      className={cn("relative aspect-square w-full shrink-0 bg-contain bg-center bg-no-repeat drop-shadow-[0_10px_14px_rgba(20,70,20,0.35)]", className)}
      style={{ backgroundImage: `url(${BOARD_ART})` }}
      data-testid="board"
      role="group"
      aria-label="你的每日棋盤"
    >
      {TILES.map((tile, index) => {
        const spot = TILE_POSITIONS[index];
        const tint = TINT[tile.kind];
        const { icon, art } = TILE_INFO[tile.kind];
        const onTrail = trail.includes(index);
        const stopped = stopIndex === index;
        const scale = depthScale(spot.y);
        const place: CSSProperties = {
          left: `${spot.x * 100}%`,
          top: `${spot.y * 100}%`,
          width: `${9.4 * scale}%`,
          height: `${7.4 * scale}%`,
        };
        return (
          <div
            key={tile.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={place}
            title={tile.name}
            data-square={index}
            data-trail={onTrail ? "true" : undefined}
          >
            {/* Rhombus matching the isometric square underneath. */}
            <span
              className={cn(
                "absolute inset-0 m-auto block aspect-square w-[72%] rounded-[18%]",
                "[transform:scaleY(0.78)_rotate(45deg)]",
                onTrail && "shadow-[0_0_0_3px_rgba(255,255,255,0.95)]",
                stopped && "shadow-[0_0_0_4px_#FBD000,0_0_18px_6px_rgba(251,208,0,0.8)]",
              )}
              style={{ background: tint ?? (onTrail || stopped ? "rgba(255,255,255,0.55)" : "transparent") }}
            />
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center leading-none drop-shadow-[0_1px_1px_rgba(30,58,138,0.7)]",
                tile.kind === "coin" ? "text-[clamp(9px,2.6vw,14px)]" : "text-[clamp(12px,3.6vw,19px)]",
                stopped && "animate-[pop_0.35s_ease-out]",
              )}
              aria-hidden
            >
              {art ? (
                <img
                  src={art}
                  alt=""
                  draggable={false}
                  className={cn("object-contain", tile.kind === "coin" ? "w-[62%]" : "w-[82%]")}
                />
              ) : (
                icon
              )}
            </span>
          </div>
        );
      })}

      {/* The player's token rides above its square. */}
      <div
        className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-[85%] flex-col items-center transition-[left,top] duration-200 ease-out"
        style={{ left: `${TILE_POSITIONS[position].x * 100}%`, top: `${TILE_POSITIONS[position].y * 100}%` }}
        data-testid="token"
        aria-current="true"
      >
        <span
          key={position}
          className="flex size-[clamp(26px,8vw,42px)] animate-[hop_0.22s_ease-out] items-center justify-center rounded-full border-[3px] border-[#FBD000] bg-[#1E3A8A] text-[clamp(11px,3vw,16px)] font-black text-[#FFFFFF] shadow-[0_6px_10px_rgba(30,58,138,0.45)]">
          🧛
        </span>
        <span className="-mt-0.5 h-2 w-2 rotate-45 bg-[#FBD000]" />
      </div>

      {burst ? (
        <div
          key={burst.key}
          className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ left: `${TILE_POSITIONS[burst.index].x * 100}%`, top: `${TILE_POSITIONS[burst.index].y * 100}%` }}
          data-testid="burst"
        >
          {burst.text ? (
            <span
              className={cn(
                "animate-[float-up_1.6s_ease-out_0.25s_both] rounded-full border-2 border-white px-2 text-[clamp(13px,4vw,20px)] font-black tabular-nums text-white shadow-md",
                burst.bad ? "bg-[#46506E]" : "bg-[#43B047]",
              )}
            >
              {burst.text}
            </span>
          ) : null}
          {/* Penalties wobble first; the burst sits on an inner span so the two motions don't fight. */}
          <span className={cn("block", burst.bad && "animate-[shake_0.6s_ease-in-out]")}>
            <span
              className={cn(
                "block text-[clamp(28px,9vw,48px)] leading-none drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)]",
                burst.bad ? "animate-[pop_0.25s_ease-out,fade-out_0.5s_ease-in_1.3s_forwards]" : "animate-[burst_1.4s_ease-out_both]",
              )}
            >
              {burst.art ? (
                <img src={burst.art} alt="" draggable={false} className="size-[clamp(34px,11vw,58px)] object-contain" />
              ) : (
                burst.icon
              )}
            </span>
          </span>
          {!burst.bad ? (
            <img
              src={FX_ART.sparkle}
              alt=""
              draggable={false}
              className="absolute bottom-0 left-1/2 -z-10 size-[clamp(60px,20vw,110px)] -translate-x-1/2 translate-y-1/4 object-contain animate-[sparkle_0.9s_ease-out_0.15s_both]"
            />
          ) : null}
        </div>
      ) : null}

      {/* The board's green centre shows the dice while they roll; otherwise it stays clear. */}
      {centre ? (
        <div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-[3%] animate-[pop_0.35s_ease-out]"
          style={{ left: `${BOARD_CENTRE.x * 100}%`, top: `${BOARD_CENTRE.y * 100}%` }}
          data-testid="walk-result"
        >
          {centre}
        </div>
      ) : null}
    </div>
  );
}
