import { TILES, TILE_PLACEMENT } from "@/lib/board";
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
      <div className="grid aspect-square grid-cols-4 grid-rows-4 gap-1.5 sm:gap-2">
        {TILES.map((tile, index) => {
          const landmark = landmarkOf(landmarks, tile.landmarkIndex);
          const current = index === position;
          const built = landmark === "built";
          const ruined = landmark === "ruined";
          const trailOrder = trail.indexOf(index);
          const onTrail = trailOrder >= 0;
          const stopped = stopIndex === index;
          const status = built ? "已建成" : ruined ? "廢墟" : tile.kind === "landmark" ? "未建" : null;
          return (
            <div
              key={tile.id}
              className={cn(
                "relative flex h-full flex-col items-center justify-center rounded-xl border px-1 text-center",
                TILE_PLACEMENT[index],
                built && "border-[#174f36] bg-[#1f6b4a] text-[#f4fff8]",
                ruined && "border-[#4e221e] bg-[#6e332c] text-[#fff4ef]",
                !built && !ruined && tile.kind === "start" && "border-[#e0bf78] bg-[#f0d7a2] text-[#3a2714]",
                !built && !ruined && tile.kind === "street" && "border-[#e4d3ba] bg-[#f7efe2] text-[#2a1c14]",
                tile.kind === "attack" && "border-[#9e3428] bg-[#9e3428] text-[#fff7ee]",
                tile.kind === "landmark" && !built && !ruined && "border-dashed",
                onTrail && "z-10 ring-2 ring-[#f0d7a2] ring-offset-2 ring-offset-[#3b2a1f]",
                stopped && "z-20 ring-4 ring-[#e2b657]",
              )}
              data-square={index}
              data-trail={onTrail ? "true" : undefined}
              data-trail-step={onTrail ? trailOrder + 1 : undefined}
              aria-current={current ? "true" : undefined}
            >
              {onTrail ? (
                <span className="absolute left-1 top-1 rounded bg-[#f0d7a2] px-1 text-[10px] font-bold text-[#3a2714]">
                  {trailOrder + 1}
                </span>
              ) : null}
              <span className="text-xs font-semibold sm:text-sm">{tile.name}</span>
              {status ? <span className="mt-0.5 text-[10px] tracking-wide opacity-90">{status}</span> : null}
              {current ? (
                <span
                  className="rounded-full bg-[#f0d7a2] px-1.5 text-[10px] font-bold text-[#3a2714]"
                  data-testid="token"
                >
                  你
                </span>
              ) : null}
              {stopped ? (
                <span
                  className="mt-0.5 rounded bg-[#e2b657] px-1 text-[10px] font-bold text-[#3a2714]"
                  data-testid="stop-marker"
                >
                  停
                </span>
              ) : null}
            </div>
          );
        })}
        <div className="col-start-2 col-span-2 row-start-2 row-span-2 flex flex-col items-center justify-center rounded-2xl bg-[#241910] px-2 text-center text-[#f6efe4]">
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
