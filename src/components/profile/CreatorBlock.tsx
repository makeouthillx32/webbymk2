// components/profile/CreatorBlock.tsx
// Shows up automatically inside the account page once a profile has been
// set up as a creator (admin-only, from Dashboard → Labs → Creators).
// Renders nothing for everyone else.
"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type CreatorData = {
  id: string;
  status: "active" | "paused" | "removed";
  balance_cents: number;
  lifetime_earned_cents: number;
  lifetime_paid_cents: number;
  cashout_threshold_cents: number;
  creator_tiers: { name: string; percent_off: number } | null;
  discounts: { code: string } | null;
};

type LedgerEntry = {
  id: string;
  order_number: string | null;
  kind: "earned" | "reversal" | "adjustment";
  amount_cents: number;
  description: string | null;
  created_at: string;
};

type CashoutEntry = {
  id: string;
  amount_cents: number;
  status: "requested" | "paid" | "failed" | "cancelled";
  requested_at: string;
  resolved_at: string | null;
  failure_reason: string | null;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CreatorBlock() {
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [cashouts, setCashouts] = useState<CashoutEntry[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/creator/me");
      const data = await res.json();
      setCreator(data.creator ?? null);
      setLedger(data.ledger ?? []);
      setCashouts(data.cashouts ?? []);
    } catch {
      setCreator(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading || !creator) return null;

  const pendingCashout = cashouts.find((c) => c.status === "requested");
  const eligible = creator.balance_cents >= creator.cashout_threshold_cents;
  const lastFailed = cashouts.find((c) => c.status === "failed");

  const requestCashout = async () => {
    setMessage(null);
    setRequesting(true);
    try {
      const res = await fetch("/api/creator/cashout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to request cash-out");
      setMessage("✅ Cash-out requested — you'll be paid manually once it's reviewed.");
      await load();
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-5 py-4">
        <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
        <h2 className="text-base font-semibold text-foreground">Creator program</h2>
        {creator.status !== "active" && (
          <span className="rounded-full bg-[hsl(var(--destructive))]/10 px-2 py-0.5 text-xs text-[hsl(var(--destructive))]">
            {creator.status}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Your code</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {creator.discounts?.code ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {creator.creator_tiers?.percent_off ?? 0}% off for customers, and the same % is your cut.
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Balance</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{money(creator.balance_cents)}</p>
          <p className="text-xs text-muted-foreground">
            Cash out once you reach {money(creator.cashout_threshold_cents)}
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Lifetime</p>
          <p className="mt-1 text-sm text-foreground">{money(creator.lifetime_earned_cents)} earned</p>
          <p className="text-sm text-foreground">{money(creator.lifetime_paid_cents)} paid out</p>
        </div>
      </div>

      <div className="border-t border-[hsl(var(--border))] px-5 py-4">
        {pendingCashout ? (
          <p className="text-sm text-muted-foreground">
            Cash-out of {money(pendingCashout.amount_cents)} requested{" "}
            {new Date(pendingCashout.requested_at).toLocaleDateString()} — waiting on review.
          </p>
        ) : (
          <button
            type="button"
            disabled={!eligible || requesting || creator.status !== "active"}
            onClick={requestCashout}
            className="inline-flex h-9 items-center justify-center rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {requesting ? "Requesting..." : "Request cash-out"}
          </button>
        )}

        {!eligible && !pendingCashout && (
          <p className="mt-2 text-xs text-muted-foreground">
            {money(creator.cashout_threshold_cents - creator.balance_cents)} more to go.
          </p>
        )}

        {lastFailed && (
          <p className="mt-2 text-xs text-[hsl(var(--destructive))]">
            Last cash-out attempt failed: {lastFailed.failure_reason ?? "no reason given"}. You can request again.
          </p>
        )}

        {message && <p className="mt-2 text-sm">{message}</p>}
      </div>

      {ledger.length > 0 && (
        <div className="border-t border-[hsl(var(--border))] px-5 py-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Recent activity</p>
          <div className="space-y-1.5">
            {ledger.slice(0, 8).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {entry.order_number ? `Order ${entry.order_number}` : entry.description ?? entry.kind}
                </span>
                <span className={entry.amount_cents < 0 ? "text-[hsl(var(--destructive))]" : "text-foreground"}>
                  {entry.amount_cents < 0 ? "-" : "+"}
                  {money(Math.abs(entry.amount_cents))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
