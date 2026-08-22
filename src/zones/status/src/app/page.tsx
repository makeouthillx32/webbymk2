import { fetchStatusSnapshot, type CurrentService } from "../lib/status";
import UptimeBars from "../components/UptimeBars";

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

export default async function StatusPage() {
  const { current, history, incidents } = await fetchStatusSnapshot();

  const overall = current.length === 0 ? "operational" : overallStatus(current);
  const historyByGroup = new Map(history.map((h) => [h.id, h]));

  return (
    <div className="wrap">
      <div className="header">
        <div className="brand">Unenter Status</div>
      </div>

      <div className={`banner ${overall}`}>
        <span className="dot" />
        {BANNER_TEXT[overall]}
      </div>

      {current.length === 0 ? (
        <p className="empty">No status data yet — the collector just started reporting.</p>
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

      <div className="section-title">Past Incidents</div>
      {incidents.length === 0 ? (
        <p className="empty">No incidents reported.</p>
      ) : (
        incidents.map((incident) => (
          <div className="incident" key={incident.id}>
            <div className="incident-date">{formatDate(incident.started_at)}</div>
            <div className="incident-title">{incident.title}</div>
            {incident.updates.map((update, i) => (
              <div className="incident-update" key={i}>
                <span className="u-status">{update.status}</span> — {update.body}
                <span className="u-time">{formatDateTime(update.created_at)}</span>
              </div>
            ))}
          </div>
        ))
      )}

      <div className="footer">unenter.live status</div>
    </div>
  );
}
