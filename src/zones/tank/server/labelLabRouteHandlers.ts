import { NextResponse } from "next/server";
import { requireStaff } from "./staffAuth";
import { applyLabAction, listLabelLab, loadIdentityMap, LAB_KINDS, LAB_QUEUES, LAB_SCOPES, type LabAction, type LabClass, type LabKind, type LabQueue, type LabScope } from "./labelLabDb";

// Staff-only: these crops are the inside of the house.

export async function GET(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  const url = new URL(request.url);
  if (url.searchParams.get("map") === "1") {
    try {
      return NextResponse.json({ success: true, map: await loadIdentityMap() });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }
  const queue = url.searchParams.get("queue");
  const cls = url.searchParams.get("class");
  const scope = url.searchParams.get("scope");
  const kind = url.searchParams.get("kind");
  const who = url.searchParams.get("who");
  // Asking about one group's look-alikes is a separate, heavier read: the
  // centroids never leave the server, only the four best names and scores.
  const similarFor = url.searchParams.get("similar");
  try {
    return NextResponse.json({
      success: true,
      ...(await listLabelLab({
        queue: LAB_QUEUES.includes(queue as LabQueue) ? (queue as LabQueue) : undefined,
        cls: cls === "person" || cls === "cat" || cls === "dog" ? (cls as LabClass) : undefined,
        scope: LAB_SCOPES.includes(scope as LabScope) ? (scope as LabScope) : undefined,
        kind: LAB_KINDS.includes(kind as LabKind) ? (kind as LabKind) : undefined,
        who: who && who.length <= 64 ? who : undefined,
        focus: (url.searchParams.get("focus") ?? "").slice(0, 200) || undefined,
        similarFor: similarFor && similarFor.length <= 200 ? similarFor : undefined,
        limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 60)),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  try {
    const body = (await request.json()) as LabAction;
    return NextResponse.json({ success: true, ...(await applyLabAction(body, staff.id)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
