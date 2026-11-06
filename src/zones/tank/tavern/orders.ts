// What a Tavern order asks for, and the one answer that serves it: the same
// response keys tank_resolve_tavern_chit checks, shared by the Tavern panel
// and the house's bar (where the bartender serves by walking up and pressing E).

export type TavernOrder = { troubleType: string | null; payload: Record<string, unknown> | null | undefined };

/** The answer that serves this order, or null when it can't be served (a malformed order). */
export function orderResponse(order: TavernOrder): { key: string; label: string } | null {
  if (order.troubleType) {
    return { key: `handle:${order.troubleType}`, label: order.troubleType === "spill" ? "Clean it up" : "Say hello" };
  }
  const item = typeof order.payload?.item === "string" ? order.payload.item : null;
  if (!item) return null;
  return { key: `serve:${item}`, label: `Serve ${item}` };
}

const ITEM_EMOJI: Record<string, string> = { ale: "🍺", beer: "🍺", bread: "🍞", wine: "🍷", mead: "🍯", water: "💧", soup: "🍲", stew: "🍲" };

/** The speech bubble over a customer's head: what they want, at a glance. */
export function orderBubble(order: TavernOrder): string {
  if (order.troubleType === "spill") return "💦 Spill!";
  if (order.troubleType === "newcomer") return "👋 Hi…?";
  if (order.troubleType) return "❗ Help!";
  const item = typeof order.payload?.item === "string" ? order.payload.item : "";
  if (!item) return "…";
  const name = item.charAt(0).toUpperCase() + item.slice(1);
  return `${ITEM_EMOJI[item.toLowerCase()] ?? "🍽️"} ${name}`.slice(0, 18);
}
