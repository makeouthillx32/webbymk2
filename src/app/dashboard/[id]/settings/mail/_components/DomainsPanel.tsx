// app/settings/mail/_components/DomainsPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Plus } from "lucide-react";
import { LoadingState } from "./LoadingState";
import { ErrorAlert } from "./ErrorAlert";

type Domain = { name: string };
type Dkim = { selector: string; public: string } | null;

function DomainRow({ domain }: { domain: Domain }) {
  const [dkim, setDkim] = useState<Dkim>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/mail-server/domains/${encodeURIComponent(domain.name)}/dkim`)
      .then((res) => (res.ok ? res.json() : { dkim: null }))
      .then((data) => setDkim(data.dkim ?? null))
      .catch(() => setDkim(null))
      .finally(() => setChecked(true));
  }, [domain.name]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mail-server/domains/${encodeURIComponent(domain.name)}/dkim`, {
        method: "PUT",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate DKIM key");
      setDkim(data.dkim ?? null);
    } catch (e: any) {
      setError(e.message ?? "Failed to generate DKIM key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm font-semibold text-[hsl(var(--foreground))]">{domain.name}</p>

        {!checked ? (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">Checking DKIM...</span>
        ) : dkim ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <ShieldCheck className="h-3.5 w-3.5" /> DKIM configured
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={generate}
            className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-[hsl(var(--border))] px-2.5 py-1 text-xs hover:bg-[hsl(var(--muted))] disabled:opacity-50"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            {busy ? "Generating..." : "Generate DKIM key"}
          </button>
        )}
      </div>

      {dkim && (
        <div className="mt-2 rounded-[var(--radius)] bg-[hsl(var(--muted))] p-2 text-xs">
          <p className="text-[hsl(var(--muted-foreground))]">
            Add this TXT record at your DNS provider so mail doesn't land in spam:
          </p>
          <p className="mt-1 font-mono">{dkim.selector}._domainkey.{domain.name}</p>
          <p className="mt-1 break-all font-mono text-[11px]">v=DKIM1; k=rsa; p={dkim.public}</p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-[hsl(var(--destructive))]">{error}</p>}
    </div>
  );
}

export function DomainsPanel() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/mail-server/domains");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load domains");
      setDomains(data.domains ?? []);
    } catch (e: any) {
      setErr(e.message ?? "Failed to load domains");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addDomain = async () => {
    const name = newDomain.trim().toLowerCase();
    if (!name) return;
    setAdding(true);
    setErr(null);
    try {
      const res = await fetch("/api/mail-server/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add domain");
      setNewDomain("");
      await load();
    } catch (e: any) {
      setErr(e.message ?? "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <LoadingState label="Loading domains..." />;

  return (
    <div className="space-y-3">
      {err ? <ErrorAlert message={err} onRetry={load} /> : null}

      <div className="flex gap-2">
        <input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="unenter.live"
          className="h-9 flex-1 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-mono"
        />
        <button
          type="button"
          disabled={adding || !newDomain.trim()}
          onClick={addDomain}
          className="inline-flex h-9 items-center gap-1 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-3 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add domain
        </button>
      </div>

      {domains.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">No domains yet.</p>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => (
            <DomainRow key={d.name} domain={d} />
          ))}
        </div>
      )}
    </div>
  );
}
