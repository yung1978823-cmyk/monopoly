import { BOARD_ART, BOARD_CENTRE, TILES, TILE_POSITIONS, type Tile } from "@/lib/board";
import type { Landmark } from "@/lib/game";
import { cn } from "cn";
import type { CSSProperties, ReactNode } from "react";

function landmarkOf(landmarks: Landmark[], index: number | null): Landmark | null {
  if (index === null) return null;
  return landmarks[index] ?? null;
}

/** Squares nearer the bottom of the art are drawn larger, so the overlays grow with them. */
function depthScale(y: number): number {
  return 0.88 + (0.28 * (y - 0.09)) / 0.7;
}

/** Tint and label laid over a square of the art. Plain streets stay bare. */
function overlayOf(tile: Tile, built: boolean, ruined: boolean): { tint: string; label: string } | null {
  if (tile.kind === "attack") return { tint: "rgba(229,37,33,0.85)", label: "🔨" };
  if (tile.kind === "start") return { tint: "rgba(251,208,0,0.9)", label: "起點" };
  if (tile.kind === "landmark") {
    if (ruined) return { tint: "rgba(90,60,55,0.85)", label: `💥${tile.name}` };
    return { tint: built ? "rgba(67,176,71,0.9)" : "rgba(67,176,71,0.55)", label: tile.name };
  }
  return null;
}

export function BoardRing({
  position,
  landmarks,
  centre = null,
  trail = [],
  stopIndex = null,
  className,
}: {
  position: number;
  landmarks: Landmark[];
  /** Shown in the middle of the board, e.g. the dice being rolled. */
  centre?: ReactNode;
  trail?: number[];
  stopIndex?: number | null;
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
        const landmark = landmarkOf(landmarks, tile.landmarkIndex);
        const built = landmark === "built";
        const overlay = overlayOf(tile, built, landmark === "ruined");
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
            title={`${tile.name}${built ? "（已建成）" : landmark === "ruined" ? "（已打爛）" : tile.kind === "landmark" ? "（未建）" : ""}`}
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
              style={{ background: overlay?.tint ?? (onTrail || stopped ? "rgba(255,255,255,0.55)" : "transparent") }}
            />
            {overlay ? (
              <span className="absolute inset-0 flex items-center justify-center text-[clamp(8px,2.4vw,13px)] font-bold leading-none text-white drop-shadow-[0_1px_1px_rgba(30,58,138,0.8)]">
                {overlay.label}
              </span>
            ) : null}
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
        <span className="flex size-[clamp(26px,8vw,42px)] items-center justify-center rounded-full border-[3px] border-[#FBD000] bg-[#1E3A8A] text-[clamp(11px,3vw,16px)] font-black text-[#FFFFFF] shadow-[0_6px_10px_rgba(30,58,138,0.45)]">
          🧛
        </span>
        <span className="-mt-0.5 h-2 w-2 rotate-45 bg-[#FBD000]" />
      </div>

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
