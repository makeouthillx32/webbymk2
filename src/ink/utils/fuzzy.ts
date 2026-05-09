export function fuzzyScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;

  const direct = haystack.indexOf(needle);
  if (direct >= 0) return direct;

  let score = 100;
  let lastIndex = -1;

  for (const ch of needle) {
    const nextIndex = haystack.indexOf(ch, lastIndex + 1);
    if (nextIndex < 0) return Number.POSITIVE_INFINITY;

    score += nextIndex === lastIndex + 1 ? 1 : 8 + (nextIndex - lastIndex);
    lastIndex = nextIndex;
  }

  return score;
}

export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  getText: (item: T) => string,
): T[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...items];

  return items
    .map((item, index) => {
      const text = getText(item);
      const score = tokens.reduce((sum, token) => {
        const tokenScore = fuzzyScore(text, token);
        return Number.isFinite(sum) && Number.isFinite(tokenScore)
          ? sum + tokenScore
          : Number.POSITIVE_INFINITY;
      }, 0);
      return { item, index, score };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.item);
}
