import Link from "next/link";
import { fetchStatusSnapshot, type CurrentService } from "../lib/status";
import UptimeBars from "../components/UptimeBars";
import RedirectNotice from "../components/RedirectNotice";

export const revalidate = 30;

function overallStatus(current: CurrentService[]) {
  if (current.some((s) => s.status === "down")) return "down";
  if (current.some((s) => s.status === "degraded")) return "degraded";
  return "operational";
}

const BANNER_TEXT = {
  operational: "All Systems Operational",
  degraded:    "Degraded Performance",
  down:        "Service Disruption",
} as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const REFRESH_COPY = {
  degraded: "A service is degraded right now. This is usually a transient reconnect — refreshing the page often clears it up.",
  down:     "A service is down right now. If a page looks broken or won't load, refreshing usually resolves it once the service recovers.",
} as const;

type StatusPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StatusPage({ searchParams }: StatusPageProps) {
  const params = await searchParams;
  const fromParam = Array.isArray(params?.from) ? params?.from[0] : params?.from;
  const { snapshot, source } = await fetchStatusSnapshot();
  const { current, history, incidents } = snapshot;

  const overall = source === "unreachable"
    ? "down"
    : current.length === 0
      ? "degraded"
      : overallStatus(current);
  const historyByGroup = new Map(history.map((h) => [h.id, h]));

  return (
    <div className="wrap">
      <div className="header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 2 V22 M3 7 L21 17 M21 7 L3 17" stroke="currentColor" strokeWidth="1" opacity="0.5" />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">UNAXIS</span>
            <span className="brand-sub">unenter.live platform status</span>
          </span>
        </Link>
      </div>

      <RedirectNotice from={fromParam} />

      <div className={`banner ${overall}`}>
        <span className="dot" />
        {BANNER_TEXT[overall]}
      </div>

      {source === "unreachable" && (
        <div className="telemetry-warning" role="alert">
          <strong>UNAXIS topology feed is unreachable.</strong>
          <span>
            This independent status endpoint is online, but it cannot currently reach the environment and node telemetry feed. Zone, router, CDN, and endpoint state may be incomplete until a UNAXIS node reconnects.
          </span>
        </div>
      )}

      {overall !== "operational" && (
        <Link className={`refresh-callout ${overall}`} href="/">
          <span>{REFRESH_COPY[overall]}</span>
          <span className="refresh-cta">Refresh →</span>
        </Link>
      )}

      {current.length === 0 ? (
        <p className="empty">
          {source === "unreachable"
            ? "No live topology data is available. This is an outage signal, not an all-clear."
            : "No status data yet — the collector just started reporting."}
        </p>
      ) : (
        current.map((service) => (
          <div className="service" key={service.id}>
            <div className="service-top">
              <span className="service-name">{service.label}</span>
              <span className={`service-status ${service.status}`}>
                <span className="dot" />
                {service.status === "operational" ? "Operational" : service.status === "degraded" ? "Degraded" : "Down"}
              </span>
            </div>
            <UptimeBars days={historyByGroup.get(service.id)?.days ?? []} />
          </div>
        ))
      )}

      <div className="section-title">Incidents</div>
      {incidents.length === 0 ? (
        <p className="empty">No incidents reported.</p>
      ) : (
        incidents.map((incident) => (
          <div className="incident" key={incident.id}>
            <div className="incident-date">{formatDate(incident.started_at)}</div>
            <div className="incident-heading">
              <div className="incident-title">{incident.title}</div>
              <span className={`incident-state ${incident.status}`}>
                {incident.status === "resolved" ? "Resolved" : `${incident.status[0]?.toUpperCase()}${incident.status.slice(1)} · Ongoing`}
              </span>
            </div>
            {incident.updates.map((update, i) => (
              <div className="incident-update" key={i}>
                <span className="u-status">{update.status}</span> — {update.body}
                <span className="u-time">{formatDateTime(update.created_at)}</span>
              </div>
            ))}
          </div>
        ))
      )}

      <div className="footer">UNAXIS · unenter.live status</div>
    </div>
  );
}
