// themes/fonts.ts
import { ThemeFonts } from "@/types/theme";

// Font name collections
const sansSerifFontNames = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Poppins",
  "Montserrat",
  "Outfit",
  "Plus Jakarta Sans",
  "DM Sans",
  "Geist",
  "Oxanium",
  "Architects Daughter",
];

const serifFontNames = [
  "Merriweather",
  "Playfair Display",
  "Lora",
  "Source Serif Pro",
  "Libre Baskerville",
  "Space Grotesk",
];

const monoFontNames = [
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "IBM Plex Mono",
  "Roboto Mono",
  "Space Mono",
  "Geist Mono",
];

// Font definitions with proper CSS font stacks
export const fonts: Record<string, string> = {
  // Sans-serif fonts
  Inter: "Inter, sans-serif",
  Roboto: "Roboto, sans-serif",
  "Open Sans": "'Open Sans', sans-serif",
  Poppins: "Poppins, sans-serif",
  Montserrat: "Montserrat, sans-serif",
  Outfit: "Outfit, sans-serif",
  "Plus Jakarta Sans": "'Plus Jakarta Sans', sans-serif",
  "DM Sans": "'DM Sans', sans-serif",
  "IBM Plex Sans": "'IBM Plex Sans', sans-serif",
  Geist: "Geist, sans-serif",
  Oxanium: "Oxanium, sans-serif",
  "Architects Daughter": "'Architects Daughter', sans-serif",

  // Serif fonts
  Merriweather: "Merriweather, serif",
  "Playfair Display": "'Playfair Display', serif",
  Lora: "Lora, serif",
  "Source Serif Pro": "'Source Serif Pro', serif",
  "Libre Baskerville": "'Libre Baskerville', serif",
  "Space Grotesk": "'Space Grotesk', serif",

  // Monospace fonts
  "JetBrains Mono": "'JetBrains Mono', monospace",
  "Fira Code": "'Fira Code', monospace",
  "Source Code Pro": "'Source Code Pro', monospace",
  "IBM Plex Mono": "'IBM Plex Mono', monospace",
  "Roboto Mono": "'Roboto Mono', monospace",
  "Space Mono": "'Space Mono', monospace",
  "Geist Mono": "'Geist Mono', monospace",
};

// Organize fonts by category
export const sansSerifFonts = Object.fromEntries(
  Object.entries(fonts).filter(([key]) => sansSerifFontNames.includes(key))
);

export const serifFonts = Object.fromEntries(
  Object.entries(fonts).filter(([key]) => serifFontNames.includes(key))
);

export const monoFonts = Object.fromEntries(
  Object.entries(fonts).filter(([key]) => monoFontNames.includes(key))
);

// Default font configuration
export const defaultFonts: ThemeFonts = {
  sans: fonts["Plus Jakarta Sans"], // Default sans
  serif: fonts["Playfair Display"],  // Default serif
  mono: fonts["JetBrains Mono"],    // Default mono
};

// Helper function to create a font configuration
export const getThemeFonts = (
  sans: keyof typeof sansSerifFonts = "Plus Jakarta Sans",
  serif: keyof typeof serifFonts = "Playfair Display",
  mono: keyof typeof monoFonts = "JetBrains Mono"
): ThemeFonts => {
  return {
    sans: sansSerifFonts[sans] || defaultFonts.sans,
    serif: serifFonts[serif] || defaultFonts.serif,
    mono: monoFonts[mono] || defaultFonts.mono,
  };
};

// Helper function to generate CSS variables for fonts
export const getFontVariables = (fonts: ThemeFonts): Record<string, string> => {
  return {
    '--font-sans': fonts.sans,
    '--font-serif': fonts.serif,
    '--font-mono': fonts.mono,
  };
};