import type { TankInventoryEntry } from "../server/gamification";

export function snapshotInventoryQuantities(
  inventory: TankInventoryEntry[],
): Record<string, number> {
  return Object.fromEntries(
    inventory.map((entry) => [entry.itemId, entry.quantity]),
  );
}

export function countNewInventoryItems(
  inventory: TankInventoryEntry[],
  seen: Record<string, number>,
): number {
  return inventory.reduce(
    (total, entry) =>
      total + Math.max(0, entry.quantity - (seen[entry.itemId] ?? 0)),
    0,
  );
}
