import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import { createCatalogAdapter } from "./providers";
import type { CatalogProviderKey } from "./types";

const PROVIDERS = [
  { key: "printful", label: "Printful", mode: "pull" },
  { key: "gelato", label: "Gelato", mode: "pull" },
  { key: "apliiq", label: "Apliiq", mode: "push" },
  { key: "gooten", label: "Gooten", mode: "pull" },
  { key: "fourthwall", label: "Fourthwall", mode: "storefront_only" },
] as const;

function pushConfigured(provider: "apliiq") {
  if (provider === "apliiq") {
    const missing = [
      ...(!process.env.APLIIQ_CALLBACK_TOKEN ? ["APLIIQ_CALLBACK_TOKEN"] : []),
      ...(!process.env.APLIIQ_APP_ID ? ["APLIIQ_APP_ID"] : []),
      ...(!process.env.APLIIQ_SHARED_SECRET ? ["APLIIQ_SHARED_SECRET"] : []),
    ];
    return { configured: missing.length === 0, missing };
  }
  return { configured: false, missing: ["Unsupported push provider"] };
}

export async function getCatalogSyncStatus() {
  const admin = createAdminClient();
  const [{ data: providerRows, error: providerError }, { data: recentRuns, error: runError }] = await Promise.all([
    admin.from("fulfillment_providers").select("id, provider_key, display_name, status, capabilities").in("provider_key", PROVIDERS.map((provider) => provider.key)),
    admin.from("provider_catalog_sync_runs").select("id, provider_id, trigger_kind, status, products_seen, products_created, products_updated, products_archived, products_failed, error_message, started_at, heartbeat_at, completed_at").order("started_at", { ascending: false }).limit(30),
  ]);
  if (providerError) throw new Error(providerError.message);
  if (runError) throw new Error(runError.message);

  return PROVIDERS.map((definition) => {
    const row = (providerRows ?? []).find((candidate) => candidate.provider_key === definition.key);
    const lastRun = (recentRuns ?? []).find((candidate) => candidate.provider_id === row?.id) ?? null;
    let configuration = { configured: false, missing: [] as string[] };
    if (definition.mode === "pull") {
      const adapter = createCatalogAdapter(definition.key as CatalogProviderKey);
      configuration = { configured: adapter.configured, missing: adapter.missingConfiguration };
    } else if (definition.mode === "push") {
      configuration = pushConfigured("apliiq");
    }
    return {
      ...definition,
      databaseStatus: row?.status ?? "missing",
      capabilities: row?.capabilities ?? {},
      configured: configuration.configured,
      missingConfiguration: configuration.missing,
      lastRun,
    };
  });
}
