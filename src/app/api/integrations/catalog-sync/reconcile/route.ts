import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runCatalogSync } from "@/lib/fulfillment/catalog/sync";
import type { CatalogProviderKey } from "@/lib/fulfillment/catalog/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.FULFILLMENT_SYNC_SECRET;
  const supplied = request.headers.get("x-fulfillment-sync-secret")
    ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? "";
  if (!secret || !safeEqual(supplied, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const providers: CatalogProviderKey[] = ["printful", "gelato", "gooten"];
  const results = [];
  for (const provider of providers) {
    try {
      results.push(await runCatalogSync({ provider, trigger: "scheduled" }));
    } catch (error) {
      results.push({
        provider,
        status: "failed",
        errors: [error instanceof Error ? error.message : "Catalog synchronization failed"],
      });
    }
  }
  const successful = results.some((result) => result.status !== "failed");
  const partial = successful && results.some((result) => result.status === "failed" || result.status === "partial");
  return NextResponse.json({ ok: successful, partial, results }, { status: successful ? 200 : 422 });
}
