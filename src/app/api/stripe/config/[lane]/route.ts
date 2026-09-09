import { NextRequest, NextResponse } from "next/server";
import {
  getCommercePublishableKey,
  getCommerceStripeMode,
  type PaymentLane,
} from "@/lib/stripe/commerce";

export const dynamic = "force-dynamic";

const LANES = new Set<PaymentLane>(["shop", "labs", "pos", "tank"]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lane: string }> },
) {
  const { lane: rawLane } = await params;
  if (!LANES.has(rawLane as PaymentLane)) {
    return NextResponse.json({ error: "Unknown payment lane" }, { status: 404 });
  }

  try {
    const lane = rawLane as PaymentLane;
    const mode = getCommerceStripeMode(lane);
    const publishableKey = getCommercePublishableKey(lane, mode);
    return NextResponse.json(
      { lane, mode, publishableKey },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Stripe lane is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
