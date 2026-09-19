export const TANK_PLAYER_QUALITIES = ["high", "medium", "low"] as const;

export type TankPlayerQuality = (typeof TANK_PLAYER_QUALITIES)[number];

export function nextTankPlayerQuality(
  quality: TankPlayerQuality,
): TankPlayerQuality {
  const index = TANK_PLAYER_QUALITIES.indexOf(quality);
  return TANK_PLAYER_QUALITIES[(index + 1) % TANK_PLAYER_QUALITIES.length];
}

export function tankPlayerQualityLabel(quality: TankPlayerQuality): string {
  return quality === "medium" ? "MED" : quality.toUpperCase();
}

type HlsLevelLike = {
  bitrate?: number;
  height?: number;
  width?: number;
};

/** Pick a concrete rendition without assuming manifest order. */
export function hlsLevelForTankQuality(
  levels: readonly HlsLevelLike[],
  quality: TankPlayerQuality,
): number {
  if (levels.length === 0) return -1;

  const ranked = levels
    .map((level, index) => ({
      index,
      score:
        (Number.isFinite(level.height) ? Number(level.height) * 1_000_000 : 0) +
        (Number.isFinite(level.width) ? Number(level.width) * 1_000 : 0) +
        (Number.isFinite(level.bitrate) ? Number(level.bitrate) : 0),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index);

  if (quality === "low") return ranked[0].index;
  if (quality === "high") return ranked[ranked.length - 1].index;
  return ranked[Math.floor((ranked.length - 1) / 2)].index;
}
