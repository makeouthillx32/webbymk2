// src/ink/utils/sparkline.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unicode Sparkline Builder.
// Generates compact trend visualizations using block characters.
// Compact sparkline helpers for Unaxis dashboard views.
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKS = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Generates a unicode sparkline string from an array of numeric values.
 * Values should ideally be normalized to [0, 1].
 * 
 * @param values Array of numbers to visualize
 * @returns A string of block characters representing the trend
 */
export function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  
  return values
    .map(value => {
      const index = Math.round(clamp(value, 0, 1) * (BLOCKS.length - 1));
      return BLOCKS[index]!;
    })
    .join('');
}
