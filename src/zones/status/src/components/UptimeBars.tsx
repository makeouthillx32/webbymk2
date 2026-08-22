import type { ServiceStatus } from "../lib/status";

const WINDOW_DAYS = 90;

function last90Days(days: { day: string; status: ServiceStatus }[]) {
  const byDay = new Map(days.map((d) => [d.day, d.status]));
  const out: { day: string; status: ServiceStatus | null }[] = [];
  const today = new Date();
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, status: byDay.get(key) ?? null });
  }
  return out;
}

function uptimePercent(days: { status: ServiceStatus | null }[]) {
  const known = days.filter((d) => d.status !== null);
  if (known.length === 0) return null;
  const good = known.filter((d) => d.status === "operational").length;
  return ((good / known.length) * 100).toFixed(2);
}

export default function UptimeBars({ days }: { days: { day: string; status: ServiceStatus }[] }) {
  const filled = last90Days(days);
  const pct = uptimePercent(filled);
  return (
    <div>
      <div className="bars">
        {filled.map((d) => (
          <div key={d.day} className={`bar ${d.status ?? "no-data"}`} title={`${d.day}: ${d.status ?? "no data"}`} />
        ))}
      </div>
      <div className="bars-labels">
        <span>{WINDOW_DAYS} days ago</span>
        <span>{pct !== null ? `${pct}% uptime` : "no data yet"}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
