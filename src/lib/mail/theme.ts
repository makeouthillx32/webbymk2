// lib/mail/theme.ts
// Resolves a stored `theme_id` (captured from the customer's `themeId`
// cookie at order/signup time — see src/app/providers/ThemeProvider.tsx for
// how that cookie gets set) into a small, email-safe hex color palette.
//
// Why not just reuse the CSS variables directly: email clients (Outlook
// desktop especially) don't reliably support `hsl()` in inline styles, and
// the site's theme_data stores HSL as a bare "H S% L%" triplet meant to be
// wrapped in `hsl(var(--x))` by Tailwind — neither works standalone in an
// <img>-and-<table> HTML email. So we convert to hex once, server-side, and
// hand templates plain hex strings.
//
// Always resolves the theme's LIGHT-mode variables, regardless of the
// customer's dark/light cookie — email dark-mode support across clients is
// too inconsistent to risk a light-on-light or dark-on-dark render.
import { createAdminClient } from "@/utils/supabase/admin";

export type EmailPalette = {
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  card: string;
  border: string;
  mutedForeground: string;
};

// Hardcoded from the "default" system theme's light variables — used
// whenever theme_id is null, unknown, or the DB is unreachable, so email
// sending never fails or looks broken for lack of a theme lookup.
const FALLBACK_PALETTE: EmailPalette = {
  primary: "#b5561f",
  primaryForeground: "#fbf8f4",
  background: "#fbf8f4",
  foreground: "#2b2624",
  card: "#f7f1e9",
  border: "#d4c4b0",
  mutedForeground: "#666057",
};

/** "24 60% 45%" -> "#b5561f". Returns null on anything unparseable. */
function hslVarToHex(hslVar: string | undefined | null): string | null {
  if (!hslVar) return null;
  const match = hslVar.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) return null;

  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${[v, v, v].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);

  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

let cache: Map<string, { palette: EmailPalette; expiresAt: number }> | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** Resolves theme_id -> email-safe hex palette. Never throws. */
export async function resolveEmailPalette(themeId: string | null | undefined): Promise<EmailPalette> {
  if (!themeId) return FALLBACK_PALETTE;

  if (!cache) cache = new Map();
  const cached = cache.get(themeId);
  if (cached && Date.now() < cached.expiresAt) return cached.palette;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("themes")
      .select("theme_data")
      .eq("id", themeId)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data?.theme_data) return FALLBACK_PALETTE;

    const light = (data.theme_data as any)?.light ?? {};

    const palette: EmailPalette = {
      primary: hslVarToHex(light["--primary"]) ?? FALLBACK_PALETTE.primary,
      primaryForeground: hslVarToHex(light["--primary-foreground"]) ?? FALLBACK_PALETTE.primaryForeground,
      background: hslVarToHex(light["--background"]) ?? FALLBACK_PALETTE.background,
      foreground: hslVarToHex(light["--foreground"]) ?? FALLBACK_PALETTE.foreground,
      card: hslVarToHex(light["--card"]) ?? FALLBACK_PALETTE.card,
      border: hslVarToHex(light["--border"]) ?? FALLBACK_PALETTE.border,
      mutedForeground: hslVarToHex(light["--muted-foreground"]) ?? FALLBACK_PALETTE.mutedForeground,
    };

    cache.set(themeId, { palette, expiresAt: Date.now() + CACHE_MS });
    return palette;
  } catch (err) {
    console.error("[mail/theme] Failed to resolve palette for", themeId, err);
    return FALLBACK_PALETTE;
  }
}
