import incidentLedger from "../data/incidents.json";
import { getDatabaseIncidents } from "./db";
import type { Incident } from "./status";

export async function fetchIncidentHistory(): Promise<Incident[]> {
  try {
    const incidents = await getDatabaseIncidents();
    if (incidents.length > 0) return incidents;
  } catch (error) {
    console.error("[v0] Incident database unavailable", error);
  }
  return incidentLedger.incidents as Incident[];
}
