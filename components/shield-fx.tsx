import { cn } from "cn";

const SHIELD_PATH = "M50 4 L90 18 V48 C90 74 72 90 50 97 C28 90 10 74 10 48 V18 Z";

function ShieldShape({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="shield-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4FB6FF" />
          <stop offset="1" stopColor="#1E3A8A" />
        </linearGradient>
      </defs>
      <path d={SHIELD_PATH} fill="url(#shield-face)" stroke="#FBD000" strokeWidth="6" strokeLinejoin="round" />
      <path d="M50 14 L80 25 V48 C80 68 66 81 50 87 Z" fill="#fff" opacity="0.18" />
      <path
        d="M50 30 L56 44 L71 45 L59 55 L63 70 L50 62 L37 70 L41 55 L29 45 L44 44 Z"
        fill="#FBD000"
        stroke="#C98A00"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The rival's shield as a drawn effect, not a picture: it slams in, then either splits in two
 * (broken) or wobbles as the hammer bounces off (blocked).
 */
export function ShieldFx({ broken }: { broken: boolean }) {
  const size = "size-[min(62cqw,16rem)]";
  if (!broken) {
    return (
      <div className={cn("relative animate-[pop_0.35s_ease-out]", size)} data-testid="shield-blocked">
        <div className="size-full animate-[shake_0.6s_ease-in-out_0.3s] drop-shadow-[0_0_24px_rgba(79,182,255,0.9)]">
          <ShieldShape className="size-full" />
        </div>
      </div>
    );
  }
  return (
    <div className={cn("relative animate-[pop_0.35s_ease-out]", size)} data-testid="shield-broken">
      {/* Two halves of the same shield fly apart along a crack down the middle. */}
      <div className="absolute inset-0 animate-[shield-left_0.9s_ease-in_forwards] [clip-path:polygon(0_0,52%_0,44%_35%,56%_55%,46%_100%,0_100%)]">
        <ShieldShape className="size-full drop-shadow-[0_0_24px_rgba(79,182,255,0.9)]" />
      </div>
      <div className="absolute inset-0 animate-[shield-right_0.9s_ease-in_forwards] [clip-path:polygon(52%_0,100%_0,100%_100%,46%_100%,56%_55%,44%_35%)]">
        <ShieldShape className="size-full drop-shadow-[0_0_24px_rgba(79,182,255,0.9)]" />
      </div>
    </div>
  );
}
