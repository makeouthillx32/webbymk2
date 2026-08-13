// app/settings/mail/_components/FailuresPanel.tsx
// Guardrail added 2026-08-08: surfaces src/lib/mail/client.ts's mail_failures
// log so a broken relay (blacklist, bad cert, wrong creds, whatever's next)
// shows up here instead of only in a container log nobody's tailing. See
// vault/Core/access-denied-reload-loop-2026-08-08.md for the incident this
// came out of.
"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { LoadingState } from "./LoadingState";
import { ErrorAlert } from "./ErrorAlert";

type MailFailure = {
  id: string;
  created_at: string;
  to_email: string;
  subject: string;
  reason: string;
  order_id: string | null;
  context: Record<string, unknown> | null;
};

export function FailuresPanel() {
  const [failures, setFailures] = useState<MailFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mail-failures");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load mail failures");
      setFailures(data.failures ?? []);
    } catch (e: any) {
      setErr(e.message ?? "Failed to load mail failures");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState label="Loading recent failures..." />;
  if (err) return <ErrorAlert message={err} onRetry={load} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Last 25 failed send attempts, most recent first. A failure here means a customer
          did not receive that email — order confirmation, shipping notice, back-in-stock, etc.
        </p>
        <button
          type="button"
          onClick={load}
          title="Refresh"
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-[hsl(var(--border))] px-3 text-sm hover:bg-[hsl(var(--muted))]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {failures.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          No recorded failures. Mail delivery looks healthy.
        </div>
      ) : (
        <div className="space-y-2">
          {failures.map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-3 rounded-[var(--radius)] border border-[hsl(var(--destructive))]/40 bg-[hsl(var(--card))] px-3 py-2.5"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                    {f.subject}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {new Date(f.created_at).toLocaleString()}
                  </p>
                </div>
                <p className="truncate font-mono text-xs text-[hsl(var(--muted-foreground))]">
                  to: {f.to_email}
                  {f.order_id ? ` · order ${f.order_id.slice(0, 8)}…` : ""}
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{f.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
