import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgTable, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { desc, eq } from "drizzle-orm";

export const statusIncidents = pgTable("status_incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  source: text("source").notNull(),
  externalId: text("external_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const statusIncidentUpdates = pgTable("status_incident_updates", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  incidentId: text("incident_id").notNull(),
  status: text("status").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
export const db = pool ? drizzle(pool) : null;

export async function getDatabaseIncidents() {
  if (!db) return [];
  const incidents = await db.select().from(statusIncidents).orderBy(desc(statusIncidents.startedAt));
  const updates = await db.select().from(statusIncidentUpdates).orderBy(desc(statusIncidentUpdates.createdAt));
  return incidents.map((incident) => ({
    id: incident.id,
    title: incident.title,
    status: incident.status as "investigating" | "identified" | "monitoring" | "resolved",
    started_at: incident.startedAt.toISOString(),
    resolved_at: incident.resolvedAt?.toISOString() ?? null,
    updates: updates.filter((update) => update.incidentId === incident.id).map((update) => ({
      status: update.status,
      body: update.body,
      created_at: update.createdAt.toISOString(),
    })),
  }));
}
