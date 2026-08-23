// src/zones/status/src/lib/status.ts
// Fetches the pre-built status snapshot from UNAXIS's own public status
// endpoint (proxy/agent.js + server.js on POWER) — deliberately NOT
// db.unenter.live. That database is unenter.live application data only;
// container/proxy/SRT-manager health is UNAXIS control-plane data and lives
// in its own local store instead. See vault/Docker for the full writeup.

const STATUS_API_URL = process.env.STATUS_API_URL!;      // e.g. https://unenter.live/__status-api/public
const STATUS_API_KEY = process.env.STATUS_API_KEY!;      // matches STATUS_PUBLIC_KEY on the agent

export type ServiceStatus = "operational" | "degraded" | "down";

export type CurrentService = { id: string; label: string; status: ServiceStatus };
export type ServiceHistory = { id: string; label: string; days: { day: string; status: ServiceStatus }[] };
export type Incident = {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  started_at: string;
  resolved_at: string | null;
  updates: { status: string; body: string; created_at: string }[];
};

export type StatusSnapshot = {
  current:      CurrentService[];
  history:      ServiceHistory[];
  incidents:    Incident[];
  generatedAt:  string;
};

const EMPTY_SNAPSHOT: StatusSnapshot = { current: [], history: [], incidents: [], generatedAt: new Date(0).toISOString() };

export async function fetchStatusSnapshot(): Promise<StatusSnapshot> {
  try {
    // Explicit timeout, shorter than Vercel's function execution limit — a
    // hung fetch to a home-network-hosted backend (over the public internet,
    // through NPM, through Docker) should fail fast and predictably rather
    // than risk the whole serverless function timing out at the platform
    // level. Confirmed live 2026-08-23: the page was silently stuck on
    // EMPTY_SNAPSHOT for minutes with zero error surfaced anywhere, because
    // this catch block swallowed the failure without logging it — that's
    // the actual bug being fixed here, not just the timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(STATUS_API_URL, {
      headers: { "x-status-key": STATUS_API_KEY },
      next: { revalidate: 30 },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) {
      console.error(`status fetch: non-OK response`, { status: res.status, url: STATUS_API_URL });
      return EMPTY_SNAPSHOT;
    }
    return res.json();
  } catch (err) {
    console.error(`status fetch: failed`, { error: err instanceof Error ? err.message : String(err), url: STATUS_API_URL });
    return EMPTY_SNAPSHOT;
  }
}
