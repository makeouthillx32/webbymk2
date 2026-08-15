import { ACTIVE_THEME } from "../theme";

// Renders @font-face rules for the active theme's fonts. A plain <style>
// tag rather than next/font/local because these fonts are hot-swappable —
// they live in Supabase Storage (theme.ts today, tank_theme_assets later)
// instead of being bundled into the app at build time. Safe to inline: the
// URLs come from our own ACTIVE_THEME constant, never user input.
export function TankThemeStyles() {
  const css = ACTIVE_THEME.fontFaces
    .map(
      (face) =>
        `@font-face{font-family:"${face.family}";src:url("${face.url}") format("${face.format}");font-weight:${face.weight ?? "400"};font-style:${face.style ?? "normal"};font-display:swap;}`,
    )
    .join("\n");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
