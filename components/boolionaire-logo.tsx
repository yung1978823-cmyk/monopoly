/**
 * The Boolionaire logo: the two O's in "BOO" are little ghosts, the first one crowned.
 * Drawn in markup so it stays sharp at any size; letters use the Baloo 2 display font.
 */
function Ghost({ crowned = false, tilt = 0 }: { crowned?: boolean; tilt?: number }) {
  return (
    <svg
      viewBox="0 0 100 118"
      className="mx-[-0.02em] inline-block h-[0.86em] w-[0.73em] translate-y-[0.02em] overflow-visible"
      style={{ transform: `rotate(${tilt}deg)` }}
      aria-hidden="true"
    >
      {crowned ? (
        <path
          d="M28 20 L34 2 L44 14 L50 0 L56 14 L66 2 L72 20 Z"
          fill="#FBD000"
          stroke="#1E3A8A"
          strokeWidth="6"
          strokeLinejoin="round"
        />
      ) : null}
      {/* Body: round head, wavy hem. */}
      <path
        d="M50 16 C22 16 8 38 8 64 L8 104 Q16 96 24 104 Q32 112 40 104 Q50 96 60 104 Q68 112 76 104 Q84 96 92 104 L92 64 C92 38 78 16 50 16 Z"
        fill="#FFFFFF"
        stroke="#1E3A8A"
        strokeWidth="9"
        strokeLinejoin="round"
      />
      <ellipse cx="36" cy="60" rx="7" ry="10" fill="#1E3A8A" />
      <ellipse cx="64" cy="60" rx="7" ry="10" fill="#1E3A8A" />
      <circle cx="38.5" cy="56" r="2.6" fill="#FFFFFF" />
      <circle cx="66.5" cy="56" r="2.6" fill="#FFFFFF" />
      <ellipse cx="25" cy="76" rx="7" ry="4.5" fill="#FF8FA3" opacity="0.8" />
      <ellipse cx="75" cy="76" rx="7" ry="4.5" fill="#FF8FA3" opacity="0.8" />
      <path d="M42 78 Q50 88 58 78" fill="none" stroke="#1E3A8A" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function BoolionaireLogo({ className }: { className?: string }) {
  return (
    <h1 className={className} aria-label="Boolionaire">
      <span className="logo-type flex items-end justify-center font-display leading-none tracking-tight text-[#FBD000]">
        <span>B</span>
        <Ghost crowned tilt={-8} />
        <Ghost tilt={6} />
        <span>LIONAIRE</span>
      </span>
    </h1>
  );
}
