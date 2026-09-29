import { formatUsd, getFinancialSummary } from "@/lib/finance/dashboard";

function Metric({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-[hsl(var(--foreground))]">{formatUsd(cents)}</dd>
    </div>
  );
}

export async function FinanceLedgerSummary() {
  try {
    const [live, test] = await Promise.all([
      getFinancialSummary("live"),
      getFinancialSummary("test"),
    ]);

    return (
      <section className="mt-4 rounded-[var(--radius)] bg-[hsl(var(--background))] p-6 shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] md:mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">Stripe Funds Ledger</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Stripe-reconciled net proceeds. Test transactions never count as live money.
            </p>
          </div>
          <span className="rounded-full bg-[hsl(var(--chart-2)/0.15)] px-3 py-1 text-xs font-bold text-[hsl(var(--chart-2))]">
            LIVE {formatUsd(live.netCents)}
          </span>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr_1.4fr]">
          <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold">Live</h3>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{live.transactionCount} entries</span>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <Metric label="Gross" cents={live.grossCents} />
              <Metric label="Stripe fees" cents={live.feeCents} />
              <Metric label="Refunds" cents={live.refundCents} />
              <Metric label="Net proceeds" cents={live.netCents} />
            </dl>
          </div>

          <div className="rounded-[var(--radius)] border border-dashed border-[hsl(var(--border))] p-4 opacity-80">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold">Test mode</h3>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">{test.transactionCount} entries</span>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <Metric label="Gross" cents={test.grossCents} />
              <Metric label="Simulated fees" cents={test.feeCents} />
              <Metric label="Refunds" cents={test.refundCents} />
              <Metric label="Net simulation" cents={test.netCents} />
            </dl>
          </div>

          <div className="overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))]">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--muted))] text-left text-xs uppercase text-[hsl(var(--muted-foreground))]">
                <tr><th className="px-4 py-3">Lane</th><th className="px-4 py-3 text-right">Live net</th><th className="px-4 py-3 text-right">Test net</th></tr>
              </thead>
              <tbody>
                {live.lanes.map((lane, index) => (
                  <tr key={lane.lane} className={index ? "border-t border-[hsl(var(--border))]" : undefined}>
                    <td className="px-4 py-3 font-semibold capitalize">{lane.lane}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatUsd(lane.netCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[hsl(var(--muted-foreground))]">
                      {formatUsd(test.lanes.find((item) => item.lane === lane.lane)?.netCents ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error("Financial ledger dashboard failed:", error);
    return (
      <section className="mt-4 rounded-[var(--radius)] border border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.08)] p-5 text-sm md:mt-6">
        <strong>Funds ledger unavailable.</strong> No placeholder financial values are being shown.
      </section>
    );
  }
}
