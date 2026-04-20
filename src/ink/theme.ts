// tui/theme.ts
// Maps core design-system color tokens to terminal color strings.
//
// The core app uses ThemedText which resolves tokens via ThemeProvider.
// Standard Ink's <Text color="..."> only accepts raw color names/hex/rgb.
// resolveColor() bridges both worlds so TUI components accept the same
// color prop values as the core design-system.
//
// Token -> dark-theme mapping (mirrors src/utils/theme.ts "dark" values):
//   success    -> green
//   error      -> red
//   warning    -> yellow
//   suggestion -> cyan   (focus cursor, info icons)
//   inactive   -> gray   (disabled, muted)
//   permission -> magenta
//   claude     -> #D4A27F (brand accent)
//
// Raw color strings (hex, rgb(), named Ink colors) pass through unchanged.

export type ThemeToken =
  | "success"
  | "error"
  | "warning"
  | "suggestion"
  | "inactive"
  | "permission"
  | "claude";

export type TuiColor = ThemeToken | string | undefined;

const TOKEN_MAP: Record<ThemeToken, string> = {
  success:    "green",
  error:      "red",
  warning:    "yellow",
  suggestion: "cyan",
  inactive:   "gray",
  permission: "magenta",
  claude:     "#D4A27F",
};

export function resolveColor(c: TuiColor): string | undefined {
  if (c === undefined) return undefined;
  return TOKEN_MAP[c as ThemeToken] ?? c;
}

export function isThemeToken(c: string): c is ThemeToken {
  return c in TOKEN_MAP;
}
