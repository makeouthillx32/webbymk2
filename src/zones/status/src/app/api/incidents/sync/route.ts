import { NextResponse } from "next/server";
import { db, statusIncidentUpdates, statusIncidents } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.STATUS_SYNC_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.STATUS_SYNC_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const payload = await request.json();
  if (!payload?.id || !payload?.title || !payload?.status || !Array.isArray(payload.updates)) {
    return NextResponse.json({ error: "Invalid incident payload" }, { status: 400 });
  }
  const now = new Date();
  await db.insert(statusIncidents).values({
    id: String(payload.id), title: String(payload.title), status: String(payload.status),
    startedAt: new Date(payload.started_at ?? now), resolvedAt: payload.resolved_at ? new Date(payload.resolved_at) : null,
    source: "auth.unenter.live", externalId: String(payload.id), createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({ target: statusIncidents.id, set: { title: String(payload.title), status: String(payload.status), resolvedAt: payload.resolved_at ? new Date(payload.resolved_at) : null, updatedAt: now } });
  for (const update of payload.updates) {
    if (!update?.body || !update?.status) continue;
    await db.insert(statusIncidentUpdates).values({ id: Date.now() + Math.floor(Math.random() * 1000), incidentId: String(payload.id), status: String(update.status), body: String(update.body), createdAt: new Date(update.created_at ?? now) });
  }
  return NextResponse.json({ ok: true, id: payload.id });
}
