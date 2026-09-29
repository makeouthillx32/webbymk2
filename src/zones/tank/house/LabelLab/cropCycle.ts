// What a click on one crop does next.
//
// A crop starts belonging to its group. The first click strikes it out — the
// common case, one bad frame in a good sighting. But most struck crops are not
// rubbish: they are somebody ELSE who wandered through the shot, and retyping
// the group's name for them is the slow path. So the click keeps going: strike,
// then each person, then the animals, then the guests, then back to normal.
//
// Kept apart from the screen so it can be tested without a browser, and away
// from the server module so importing it never drags the database client into
// the client bundle.

export type CropTarget = { slug: string; displayName: string; cls: "person" | "cat" | "dog"; guest: boolean };
export type CropState = { rejected: boolean; slug: string | null };

/** Members first, then the animals, then guests: the order a household names people in. */
export function cycleOrder(targets: CropTarget[]): CropTarget[] {
  const rank = (target: CropTarget) => (target.guest ? 2 : target.cls === "person" ? 0 : 1);
  return [...targets].sort((a, b) => rank(a) - rank(b));
}

/**
 * The state after one more click. `null` slug with `rejected: false` means the
 * crop is back to plain membership of its group.
 */
export function nextCropState(current: CropState, targets: CropTarget[]): CropState {
  const order = cycleOrder(targets);
  if (!current.rejected && !current.slug) return { rejected: true, slug: null };
  if (current.rejected) return order.length ? { rejected: false, slug: order[0].slug } : { rejected: false, slug: null };
  const at = order.findIndex((target) => target.slug === current.slug);
  // An assignment to somebody no longer offered falls back to normal rather
  // than trapping the crop in a name the household has forgotten.
  if (at < 0 || at === order.length - 1) return { rejected: false, slug: null };
  return { rejected: false, slug: order[at + 1].slug };
}

/** Short label for the badge drawn on a crop. */
export function cropBadge(state: CropState, targets: CropTarget[]): string | null {
  if (state.rejected) return null;
  if (!state.slug) return null;
  return targets.find((target) => target.slug === state.slug)?.displayName ?? state.slug;
}
