import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getCatalogSyncStatus } from "@/lib/fulfillment/catalog/status";
import { runCatalogSync } from "@/lib/fulfillment/catalog/sync";
import type { CatalogProviderKey } from "@/lib/fulfillment/catalog/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PULL_PROVIDERS: CatalogProviderKey[] = ["printful", "gelato", "gooten"];

function failure(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Catalog synchronization failed";
  const actualStatus = /already has a running/i.test(message) ? 409 : status;
  return NextResponse.json({ ok: false, error: { code: "CATALOG_SYNC_FAILED", message } }, { status: actualStatus });
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    return NextResponse.json({ ok: true, providers: await getCatalogSyncStatus() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  let body: { provider?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "INVALID_JSON", message: "Body must be valid JSON" } }, { status: 400 });
  }

  const requested = body.provider?.trim().toLowerCase();
  if (requested !== "all" && !PULL_PROVIDERS.includes(requested as CatalogProviderKey)) {
    return NextResponse.json({
      ok: false,
      error: { code: "UNSUPPORTED_PROVIDER", message: "provider must be printful, gelato, gooten, or all" },
    }, { status: 400 });
  }

  const providers = requested === "all" ? PULL_PROVIDERS : [requested as CatalogProviderKey];
  const results = [];
  for (const provider of providers) {
    try {
      results.push(await runCatalogSync({ provider, trigger: "manual", createdBy: gate.userId }));
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
