import { MAX_LEVEL } from "@/lib/rules";
import { useLang } from "@/lib/i18n";
import { cn } from "cn";

/** Emoji fallback per level, used only if a picture is missing: frame, cabin, house, mansion, castle. */
const LEVEL_ICONS = ["", "⛺", "🛖", "🏠", "🏡", "🏰"] as const;
/** Drawn art per level: frame → log cabin → cottage → mansion → castle. */
const LEVEL_ART: readonly (string | null)[] = [null, 1, 2, 3, 4, 5].map((level) => (level ? `/art/buildings/${level}.png` : null));

/** A building at its level, drawn a little bigger each level. Level 0 draws nothing. */
export function Building({ level, className }: { level: number; className?: string }) {
  if (level < 1) return null;
  const art = LEVEL_ART[level];
  const grow = 0.75 + level * 0.07;
  return (
    <span
      className={cn("inline-flex items-end justify-center leading-none drop-shadow-[0_6px_6px_rgba(0,0,0,0.3)]", className)}
      style={{ fontSize: `${grow}em` }}
      aria-hidden
    >
      {art ? <img src={art} alt="" draggable={false} className="h-[1.35em] w-auto max-w-none object-contain" /> : LEVEL_ICONS[level]}
    </span>
  );
}

/** Five little dots: filled up to the level, hollow for levels a raid knocked down (still repairable). */
export function LevelPips({ level, best = level, className }: { level: number; best?: number; className?: string }) {
  const { t } = useLang();
  return (
    <span className={cn("flex gap-0.5", className)} aria-label={t("第 {n} 級", { n: level })}>
      {Array.from({ length: MAX_LEVEL }, (_, index) => (
        <span
          key={index}
          className={cn(
            "size-2 rounded-full border border-white/80 shadow-sm",
            index < level ? "bg-[#FBD000]" : index < best ? "bg-[#E52521]/70" : "bg-black/25",
          )}
        />
      ))}
    </span>
  );
}
