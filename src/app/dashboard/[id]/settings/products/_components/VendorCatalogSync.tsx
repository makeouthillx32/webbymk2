"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type SyncRun = {
  id: string;
  status: string;
  products_seen: number;
  products_created: number;
  products_updated: number;
  products_archived: number;
  products_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type ProviderStatus = {
  key: string;
  label: string;
  mode: "pull" | "push" | "unavailable" | "storefront_only";
  databaseStatus: string;
  configured: boolean;
  missingConfiguration: string[];
  lastRun: SyncRun | null;
};

function runSummary(run: SyncRun | null) {
  if (!run) return "Never synchronized";
  const when = new Date(run.completed_at ?? run.started_at).toLocaleString();
  if (run.status === "running") return `Running · ${run.products_seen} seen`;
  return `${run.status} ${when} · ${run.products_created} new · ${run.products_updated} updated · ${run.products_archived} drafted · ${run.products_failed} failed`;
}

export default function VendorCatalogSync({ onProductsChanged }: { onProductsChanged: () => void | Promise<void> }) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/catalog-sync", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json?.error?.message ?? "Could not load vendor status");
      setProviders(json.providers ?? []);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load vendor status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sync = async (provider: string) => {
    setRunning(provider);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/catalog-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = await response.json();
      const result = json.results?.[0];
      if (!response.ok || !json.ok) {
        throw new Error(result?.errors?.join("; ") ?? json?.error?.message ?? "Vendor synchronization failed");
      }
      const totals = json.results.reduce((sum: number, item: any) => sum + Number(item.created ?? 0) + Number(item.updated ?? 0), 0);
      const failures = json.results
        .filter((item: any) => item.status === "failed" || item.status === "partial")
        .map((item: any) => `${item.provider}: ${item.errors?.[0] ?? item.status}`);
      setMessage(json.partial
        ? `Synchronization partially completed. ${totals} product record${totals === 1 ? "" : "s"} written to Shop. ${failures.join("; ")}`
        : `Synchronization completed. ${totals} product record${totals === 1 ? "" : "s"} written to Shop.`);
      await Promise.all([load(), onProductsChanged()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vendor synchronization failed");
      await load();
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[var(--shadow-xs)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-[hsl(var(--foreground))]">Vendor products</h2>
          <p className="mt-1 max-w-3xl text-sm text-[hsl(var(--muted-foreground))]">
            Pull saved garments into Shop as drafts. Vendor sync never publishes a product or overwrites your Shop retail price.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void load()} disabled={loading || Boolean(running)}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Status
          </Button>
          <Button type="button" size="sm" onClick={() => void sync("all")} disabled={loading || Boolean(running) || !providers.some((provider) => provider.mode === "pull" && provider.configured)}>
            {running === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-2 h-4 w-4" />}
            Sync all
          </Button>
        </div>
      </div>

      {message ? <div className="mt-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 text-sm">{message}</div> : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {providers.map((provider) => {
          const available = provider.mode === "pull" && provider.configured && !["paused", "disabled", "missing"].includes(provider.databaseStatus);
          return (
            <div key={provider.key} className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {available || (provider.mode === "push" && provider.configured)
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    : provider.mode === "unavailable" || provider.mode === "storefront_only"
                      ? <XCircle className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                      : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                  <div className="min-w-0">
                    <div className="font-medium text-[hsl(var(--foreground))]">{provider.label}</div>
                    <div className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                      {provider.mode === "pull" ? runSummary(provider.lastRun) : provider.mode === "push" ? "Use Add to Store inside Apliiq" : provider.mode === "storefront_only" ? "Storefront API only; manufacturing import disabled" : "Saved-product API adapter not verified"}
                    </div>
                  </div>
                </div>
                {provider.mode === "pull" ? (
                  <Button type="button" size="sm" variant="secondary" disabled={!available || Boolean(running)} onClick={() => void sync(provider.key)}>
                    {running === provider.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-2 h-4 w-4" />}
                    Pull
                  </Button>
                ) : provider.mode === "push" ? (
                  <Button type="button" size="sm" variant="secondary" disabled>
                    <Send className="mr-2 h-4 w-4" /> Push intake
                  </Button>
                ) : null}
              </div>
              {!provider.configured && provider.missingConfiguration.length ? (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Missing server configuration: {provider.missingConfiguration.join(", ")}</p>
              ) : null}
              {provider.lastRun?.error_message ? (
                <details className="mt-2 text-xs text-[hsl(var(--destructive))]">
                  <summary className="cursor-pointer">Last sync details</summary>
                  <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap">{provider.lastRun.error_message}</pre>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
