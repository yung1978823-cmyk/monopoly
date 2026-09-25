import { BOARD_SIDE, TILES, TILE_PLACEMENT } from "@/lib/board";
import type { Landmark } from "@/lib/game";
import { cn } from "cn";

function landmarkOf(landmarks: Landmark[], index: number | null): Landmark | null {
  if (index === null) return null;
  return landmarks[index] ?? null;
}

export function BoardRing({
  position,
  landmarks,
  points,
  defense,
  purseLabel,
  placeLabel,
  trail = [],
  stopIndex = null,
}: {
  position: number;
  landmarks: Landmark[];
  points: number;
  defense: number;
  purseLabel: string;
  placeLabel: string;
  trail?: number[];
  stopIndex?: number | null;
}) {
  return (
    <div
      className="rounded-[28px] bg-[#3b2a1f] p-2.5 shadow-[inset_0_0_0_3px_#6a4b34,0_16px_40px_rgba(48,24,10,0.25)] sm:p-3"
      data-testid="board"
      role="group"
      aria-label="你的每日棋盤"
    >
      <div
        className="grid aspect-square gap-0.5 sm:gap-1"
        style={{
          gridTemplateColumns: `repeat(${BOARD_SIDE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${BOARD_SIDE}, minmax(0, 1fr))`,
        }}
      >
        {TILES.map((tile, index) => {
          const landmark = landmarkOf(landmarks, tile.landmarkIndex);
          const current = index === position;
          const built = landmark === "built";
          const trailOrder = trail.indexOf(index);
          const onTrail = trailOrder >= 0;
          const stopped = stopIndex === index;
          const label =
            tile.kind === "attack" ? "攻" : tile.kind === "start" ? "起" : tile.kind === "landmark" ? tile.name : null;
          const place = TILE_PLACEMENT[index];
          return (
            <div
              key={tile.id}
              className={cn(
                "relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden rounded-md border text-center",
                built && "border-[#174f36] bg-[#1f6b4a] text-[#f4fff8]",
                !built && tile.kind === "start" && "border-[#e0bf78] bg-[#f0d7a2] text-[#3a2714]",
                !built && tile.kind === "street" && "border-[#e4d3ba] bg-[#f7efe2] text-[#2a1c14]",
                tile.kind === "attack" && "border-[#9e3428] bg-[#9e3428] text-[#fff7ee]",
                tile.kind === "landmark" && !built && "border-dashed",
                onTrail && "z-10 ring-2 ring-[#f0d7a2]",
                stopped && "z-20 ring-2 ring-[#e2b657] ring-offset-1 ring-offset-[#3b2a1f]",
              )}
              style={{ gridColumn: place.col, gridRow: place.row }}
              title={`${tile.name}${built ? "（已建成）" : tile.kind === "landmark" ? "（未建）" : ""}`}
              data-square={index}
              data-trail={onTrail ? "true" : undefined}
              data-trail-step={onTrail ? trailOrder + 1 : undefined}
              aria-current={current ? "true" : undefined}
            >
              {label ? (
                <span className="px-0.5 text-[9px] font-semibold leading-none sm:text-xs">{label}</span>
              ) : null}
              {current ? (
                <span
                  className="absolute inset-0 m-auto flex size-[80%] items-center justify-center rounded-full bg-[#f0d7a2] text-[9px] font-bold text-[#3a2714] shadow sm:text-xs"
                  data-testid="token"
                >
                  你
                </span>
              ) : null}
            </div>
          );
        })}
        <div
          style={{ gridColumn: `2 / ${BOARD_SIDE}`, gridRow: `2 / ${BOARD_SIDE}` }}
          className="flex flex-col items-center justify-center rounded-2xl bg-[#241910] px-2 text-center text-[#f6efe4]"
        >
          <p className="text-[10px] tracking-[0.22em] text-[#e2b657]">分數</p>
          <p className="text-4xl font-bold tabular-nums text-[#f0d7a2] sm:text-5xl" data-testid="points">
            {points}
          </p>
          <p className="mt-1 text-xs text-[#d9cbb8]">武器 {defense}／4</p>
          <p className="text-xs text-[#8fd0be]">{purseLabel}</p>
          <p className="mt-1 text-[10px] text-[#b5a594]">{placeLabel}</p>
        </div>
      </div>
    </div>
  );
}
