const STRIPES = 8;
const STRIPE_W = 22.5;
const AWNING_X = 70;
const AWNING_TOP = 58;
const AWNING_H = 28;

const ochre = (alpha: number) => `rgba(var(--ochre-rgb), ${alpha})`;

/**
 * Neutral storefront illustration shown when a shop has no photo (or its photo fails
 * to load). Colours come from the active theme, so it follows light/dark and branding.
 */
export function ShopImagePlaceholder({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="No shop photo yet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="320" height="200" fill={ochre(0.07)} />
      <rect y="170" width="320" height="30" fill={ochre(0.14)} />

      {/* Building */}
      <rect
        x="80"
        y="74"
        width="160"
        height="96"
        rx="3"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />

      {/* Sign */}
      <rect x="120" y="36" width="80" height="16" rx="4" fill={ochre(0.3)} />
      <rect x="132" y="42" width="56" height="4" rx="2" fill={ochre(0.55)} />

      {/* Awning: alternating stripes with scalloped edge */}
      {Array.from({ length: STRIPES }, (_, i) => {
        const x = AWNING_X + i * STRIPE_W;
        const fill = i % 2 === 0 ? ochre(0.85) : "var(--surface)";
        return (
          <g key={i}>
            <rect
              x={x}
              y={AWNING_TOP}
              width={STRIPE_W}
              height={AWNING_H}
              fill={fill}
            />
            <path
              d={`M ${x} ${AWNING_TOP + AWNING_H} a ${STRIPE_W / 2} ${STRIPE_W / 2} 0 0 0 ${STRIPE_W} 0 z`}
              fill={fill}
            />
          </g>
        );
      })}
      <rect
        x={AWNING_X}
        y={AWNING_TOP}
        width={STRIPES * STRIPE_W}
        height={AWNING_H + STRIPE_W / 2}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="1.5"
        rx="2"
      />

      {/* Windows and door */}
      <rect
        x="96"
        y="112"
        width="40"
        height="34"
        rx="2"
        fill={ochre(0.12)}
        stroke="var(--border-strong)"
        strokeWidth="1.5"
      />
      <rect
        x="184"
        y="112"
        width="40"
        height="34"
        rx="2"
        fill={ochre(0.12)}
        stroke="var(--border-strong)"
        strokeWidth="1.5"
      />
      <rect
        x="148"
        y="114"
        width="24"
        height="56"
        rx="2"
        fill={ochre(0.25)}
        stroke="var(--border-strong)"
        strokeWidth="1.5"
      />
      <circle cx="166" cy="144" r="1.8" fill="var(--bistre-400)" />
    </svg>
  );
}
