import { NextRequest, NextResponse } from "next/server";
import { getTavernSnapshotAction } from "@/zones/tank/server/tavernSnapshot";

// Plain API route, not a Server Action called from the client. TavernPanel
// polls this on a short interval to pick up tick()-only changes (new chits,
// shift rotation/promotion, mutiny auto-close — none of which a Postgres
// cron job can broadcast itself, see tavernSnapshot.ts). Calling a "use
// server" export directly from client code on a timer re-renders and
// re-streams the entire page's server component tree on every tick — this
// exact failure mode already took down PollOverlay.tsx's polling once (see
// /api/tank/poll/active/route.ts's comment) — so this follows the same
// established plain-route fix instead of repeating it.
export async function GET(_request: NextRequest) {
  const snapshot = await getTavernSnapshotAction();
  return NextResponse.json(snapshot);
}
