import { cn } from "cn";

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [
    [0, 2],
    [2, 0],
  ],
  3: [
    [0, 2],
    [1, 1],
    [2, 0],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

export function DieFace({
  value,
  spinning = false,
}: {
  value: number | null;
  spinning?: boolean;
}) {
  if (value === null) {
    return (
      <div className="grid size-16 place-items-center rounded-2xl border-2 border-dashed border-[#c4b29a] bg-[#fffaf3] text-xs text-[#8a7562]">
        未擲
      </div>
    );
  }

  const pips = PIPS[value] ?? [];
  return (
    <div
      className={cn(
        "grid size-16 grid-cols-3 grid-rows-3 rounded-2xl border border-[#eadcc8] bg-[#fffaf3] p-2 shadow-[0_8px_16px_rgba(60,30,10,0.12)]",
        spinning && "animate-pulse",
      )}
      aria-label={spinning ? "骰子轉動中" : `骰子 ${value}`}
    >
      {Array.from({ length: 9 }, (_, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        const on = pips.some(([pipRow, pipColumn]) => pipRow === row && pipColumn === column);
        return (
          <span
            key={index}
            className={cn("m-auto size-2.5 rounded-full", on ? "bg-[#2a1c14]" : "bg-transparent")}
          />
        );
      })}
    </div>
  );
}
