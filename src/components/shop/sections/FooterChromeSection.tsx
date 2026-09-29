// src/components/shop/sections/FooterChromeSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "Footer Chrome / Decoration" landing section.
//
// The two gradient shapes that decorate the landing footer were hardcoded
// inside src/components/Layouts/Landing/Footer/index.tsx — fixed position,
// fixed size, and (until 2026-09-05) fixed to #4A6CF7 blue, which matched no
// active theme. This section lifts that decoration out into something you can
// place, size, tint and toggle from Landing → Home Heroes, so the chrome is
// editable instead of being buried in a component.
//
// Renders as a decorative BAND: drop it directly above the footer row in the
// section list to get the old "footer chrome" effect, or anywhere else to
// separate two sections with the same visual language.
//
// Pure SVG, no client JS, no external assets. Every colour resolves from theme
// tokens, so it follows the active theme per zone automatically — that is the
// whole point, and why nothing here takes a hex value.
//
// config (all optional):
//   shapes      "both" | "polygon" | "orb"   which decorations to draw
//   opacity     0–1                           overall strength (default 0.5)
//   height      number (px)                   band height     (default 180)
//   tint        "primary" | "accent" | "muted" | "foreground"
//   flip        boolean                       mirror horizontally
// ─────────────────────────────────────────────────────────────────────────────

import type { SectionComponentProps } from "./SectionRegistry";

type Tint = "primary" | "accent" | "muted" | "foreground";

const TINT_VAR: Record<Tint, string> = {
  primary: "var(--primary)",
  accent: "var(--accent)",
  muted: "var(--muted-foreground)",
  foreground: "var(--foreground)",
};

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

/** Angular gradient polygon — the bottom-left shape from the landing footer. */
function PolygonDecor({ uid, tint }: { uid: string; tint: string }) {
  const c = `hsl(${tint})`;
  return (
    <svg
      width="79"
      height="94"
      viewBox="0 0 79 94"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        opacity="0.3"
        x="-41"
        y="26.9426"
        width="66.6675"
        height="66.6675"
        transform="rotate(-22.9007 -41 26.9426)"
        fill={`url(#poly-a-${uid})`}
      />
      <rect
        x="-41"
        y="26.9426"
        width="66.6675"
        height="66.6675"
        transform="rotate(-22.9007 -41 26.9426)"
        stroke={`url(#poly-b-${uid})`}
        strokeWidth="0.7"
      />
      <path
        opacity="0.3"
        d="M50.5215 7.42229L20.325 1.14771L46.2077 62.3249L77.1885 68.2073L50.5215 7.42229Z"
        fill={`url(#poly-c-${uid})`}
      />
      <path
        d="M50.5215 7.42229L20.325 1.14771L46.2077 62.3249L76.7963 68.2073L50.5215 7.42229Z"
        stroke={`url(#poly-d-${uid})`}
        strokeWidth="0.7"
      />
      <path
        opacity="0.3"
        d="M17.9721 93.3057L-14.9695 88.2076L46.2077 62.325L77.1885 68.2074L17.9721 93.3057Z"
        fill={`url(#poly-e-${uid})`}
      />
      <path
        d="M17.972 93.3057L-14.1852 88.2076L46.2077 62.325L77.1884 68.2074L17.972 93.3057Z"
        stroke={`url(#poly-f-${uid})`}
        strokeWidth="0.7"
      />
      <defs>
        {/* Each gradient is duplicated per-instance with a uid-suffixed id.
            SVG gradient ids are DOCUMENT-global: two copies of this section on
            one page with the same ids would make the second silently inherit
            the first's gradient. */}
        <linearGradient id={`poly-a-${uid}`} x1="-41" y1="21.8445" x2="36.9671" y2="59.8878" gradientUnits="userSpaceOnUse">
          <stop stopColor={c} stopOpacity="0.62" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`poly-b-${uid}`} x1="25.6675" y1="95.9631" x2="-42.9608" y2="20.668" gradientUnits="userSpaceOnUse">
          <stop stopColor={c} stopOpacity="0" />
          <stop offset="1" stopColor={c} stopOpacity="0.51" />
        </linearGradient>
        <linearGradient id={`poly-c-${uid}`} x1="20.325" y1="-3.98039" x2="90.6248" y2="25.1062" gradientUnits="userSpaceOnUse">
          <stop stopColor={c} stopOpacity="0.62" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`poly-d-${uid}`} x1="18.3642" y1="-1.59742" x2="113.9" y2="80.6826" gradientUnits="userSpaceOnUse">
          <stop stopColor={c} stopOpacity="0" />
          <stop offset="1" stopColor={c} stopOpacity="0.51" />
        </linearGradient>
        <linearGradient id={`poly-e-${uid}`} x1="61.1098" y1="62.3249" x2="-8.82468" y2="58.2156" gradientUnits="userSpaceOnUse">
          <stop stopColor={c} stopOpacity="0.62" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`poly-f-${uid}`} x1="65.4236" y1="65.0701" x2="24.0178" y2="41.6598" gradientUnits="userSpaceOnUse">
          <stop stopColor={c} stopOpacity="0" />
          <stop offset="1" stopColor={c} stopOpacity="0.51" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Soft blurred orb — the top-right shape from the landing footer. */
function OrbDecor({ uid, tint }: { uid: string; tint: string }) {
  const c = `hsl(${tint})`;
  return (
    <svg
      width="55"
      height="99"
      viewBox="0 0 55 99"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <circle opacity="0.8" cx="49.5" cy="49.5" r="49.5" fill={c} />
      <mask id={`orb-m-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width="99" height="99" style={{ maskType: "alpha" }}>
        <circle opacity="0.8" cx="49.5" cy="49.5" r="49.5" fill={c} />
      </mask>
      <g mask={`url(#orb-m-${uid})`}>
        <circle opacity="0.8" cx="49.5" cy="49.5" r="49.5" fill={`url(#orb-g-${uid})`} />
        <g opacity="0.8" filter={`url(#orb-f-${uid})`}>
          <circle cx="53.8676" cy="26.2061" r="20.3824" fill="hsl(var(--background))" />
        </g>
      </g>
      <defs>
        <filter id={`orb-f-${uid}`} x="12.4852" y="-15.1763" width="82.7646" height="82.7646" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="10.5" result="effect1_foregroundBlur" />
        </filter>
        <radialGradient id={`orb-g-${uid}`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(49.5 49.5) rotate(90) scale(53.1397)">
          <stop stopOpacity="0.47" />
          <stop offset="1" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export default function FooterChromeSection({ section }: SectionComponentProps) {
  const cfg = section.config ?? {};

  const shapes = (["both", "polygon", "orb"] as const).includes(cfg.shapes)
    ? (cfg.shapes as "both" | "polygon" | "orb")
    : "both";
  const tintKey: Tint = (["primary", "accent", "muted", "foreground"] as const).includes(cfg.tint)
    ? (cfg.tint as Tint)
    : "primary";
  const tint = TINT_VAR[tintKey];
  const opacity = clamp(cfg.opacity, 0, 1, 0.5);
  const height = clamp(cfg.height, 40, 600, 180);
  const flip = cfg.flip === true;

  // The section row id keeps SVG gradient ids unique per instance — see the
  // note in PolygonDecor's <defs>.
  const uid = String(section.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "chrome";

  const showPolygon = shapes === "both" || shapes === "polygon";
  const showOrb = shapes === "both" || shapes === "orb";

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height, opacity }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={flip ? { transform: "scaleX(-1)" } : undefined}
      >
        {showPolygon && (
          <div className="absolute bottom-0 left-0">
            <PolygonDecor uid={`${uid}p`} tint={tint} />
          </div>
        )}
        {showOrb && (
          <div className="absolute right-0 top-0">
            <OrbDecor uid={`${uid}o`} tint={tint} />
          </div>
        )}
      </div>
    </div>
  );
}
