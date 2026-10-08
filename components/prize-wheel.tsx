import { ENERGY_ICON } from "@/lib/energy";
import { WHEEL_PRIZES } from "@/lib/game";

/** What each slice shows: its colour and its prize, drawn small round the rim. */
const SLICES = ["#FF5FA8", "#38BDF8", "#F08A5D", "#FBD000", "#8B5CF6", "#E52521"] as const;

/** Spin time before the prize shows (ms). */
export const WHEEL_SPIN_MS = 2400;

/**
 * 幸運轉盤 (Sky 2026-10-08): six bright slices with their prizes round the rim and a gold pointer at the top.
 * It spins five turns and eases to a stop with slice `stop` under the pointer.
 */
export function PrizeWheel({ stop }: { stop: number }) {
  const to = 360 * 5 - stop * 60;
  const R = 100;
  const point = (deg: number, r: number) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];
  return (
    <div className="relative size-[56cqw] max-h-60 max-w-60 drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)]">
      <svg
        viewBox="-110 -110 220 220"
        className="size-full"
        style={{ ["--to" as string]: `${to}deg`, animation: `wheel-spin ${WHEEL_SPIN_MS}ms cubic-bezier(0.12,0.75,0.18,1) forwards` }}
      >
        <circle r="108" fill="#FBD000" />
        <circle r="104" fill="#1E3A8A" />
        {WHEEL_PRIZES.map((prize, k) => {
          const [x1, y1] = point(k * 60 - 30, R);
          const [x2, y2] = point(k * 60 + 30, R);
          const [ix, iy] = point(k * 60, 64);
          const label = prize.coins && prize.dice ? "大獎" : prize.dice ? `${prize.dice}🎲` : prize.meat ? `${prize.meat}🍖` : prize.juice ? `${prize.juice}💎` : "";
          return (
            <g key={k}>
              <path d={`M0 0 L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} Z`} fill={SLICES[k]} stroke="#fff" strokeWidth="3" />
              <g transform={`translate(${ix} ${iy}) rotate(${k * 60})`}>
                {prize.coins && !prize.dice ? (
                  <>
                    <image href={ENERGY_ICON} x="-17" y="-26" width="34" height="34" />
                    <text y="22" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff" stroke="#1E3A8A" strokeWidth="3" paintOrder="stroke">
                      {prize.coins * 100}
                    </text>
                  </>
                ) : (
                  <text y="8" textAnchor="middle" fontSize={label === "大獎" ? 24 : 22} fontWeight="900" fill="#fff" stroke="#1E3A8A" strokeWidth="3" paintOrder="stroke">
                    {label}
                  </text>
                )}
              </g>
            </g>
          );
        })}
        {Array.from({ length: 12 }, (_, k) => {
          const [x, y] = point(k * 30, 106);
          return <circle key={k} cx={x} cy={y} r="3.5" fill="#fff" />;
        })}
        <circle r="18" fill="#FBD000" stroke="#fff" strokeWidth="4" />
      </svg>
      {/* The pointer. */}
      <svg viewBox="0 0 40 40" className="absolute left-1/2 top-[-6%] w-[18%] -translate-x-1/2">
        <path d="M20 38 L6 8 Q20 0 34 8 Z" fill="#E52521" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
