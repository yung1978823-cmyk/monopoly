import { cn } from "cn";

/** First-time pointer: a bobbing hand over the thing to tap next. No words. */
export function TipHand({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-40 text-4xl leading-none drop-shadow-[0_4px_4px_rgba(0,0,0,0.35)] animate-[point_0.9s_ease-in-out_infinite]",
        className,
      )}
      data-testid="tip-hand"
    >
      👇
    </span>
  );
}
