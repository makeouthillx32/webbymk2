// app/settings/creators/_components/CashoutsPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { LoadingState } from "./LoadingState";
import { ErrorAlert } from "./ErrorAlert";

type CashoutRow = {
  id: string;
  amount_cents: number;
  status: "requested" | "paid" | "failed" | "cancelled";
  requested_at: string;
  resolved_at: string | null;
  failure_reason: string | null;
  admin_notes: string | null;
  creators: {
    id: string;
    discounts: { code: string } | null;
    profiles: {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  } | null;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function displayName(row: CashoutRow) {
  const p = row.creators?.profiles;
  if (!p) return "Unknown profile";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return full || p.display_name || p.email || p.id;
}

export function CashoutsPanel() {
  const [rows, setRows] = useState<CashoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/creator/cashouts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load cash-out requests");
      setRows(data.cashouts ?? []);
    } catch (e: any) {
      setErr(e.message ?? "Failed to load cash-out requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resolve = async (row: CashoutRow, action: "paid" | "failed") => {
    let failure_reason: string | undefined;

    if (action === "failed") {
      const reason = window.prompt("Why did this cash-out fail? (shown on the creator's profile)");
      if (!reason || !reason.trim()) return;
      failure_reason = reason.trim();
    } else {
      const ok = window.confirm(
        `Confirm you've paid ${displayName(row)} ${money(row.amount_cents)} manually, then mark this paid.`
      );
      if (!ok) return;
    }

    setBusyId(row.id);
    try {
      const res = await fetch(`/api/creator/cashouts/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, failure_reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to resolve cash-out");
      await load();
    } catch (e: any) {
      setErr(e.message ?? "Failed to resolve cash-out");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingState label="Loading cash-out requests..." />;
  if (err) return <ErrorAlert message={err} onRetry={load} />;

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        No cash-out requests yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-col gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {displayName(row)}
              <span className="ml-2 font-mono text-xs font-normal text-[hsl(var(--muted-foreground))]">
                {row.creators?.discounts?.code ?? "—"}
              </span>
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Requested {new Date(row.requested_at).toLocaleString()}
              {row.status === "failed" && row.failure_reason ? ` · Failed: ${row.failure_reason}` : ""}
              {row.status === "paid" && row.resolved_at ? ` · Paid ${new Date(row.resolved_at).toLocaleString()}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-base font-semibold text-[hsl(var(--foreground))]">{money(row.amount_cents)}</p>

            {row.status === "requested" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => resolve(row, "paid")}
                  className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-3 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
                >
                  Mark paid
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => resolve(row, "failed")}
                  className="h-9 rounded-[var(--radius)] border border-[hsl(var(--destructive))] px-3 text-sm text-[hsl(var(--destructive))] disabled:opacity-50"
                >
                  Mark failed
                </button>
              </div>
            ) : (
              <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-1 text-xs capitalize text-[hsl(var(--muted-foreground))]">
                {row.status}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
