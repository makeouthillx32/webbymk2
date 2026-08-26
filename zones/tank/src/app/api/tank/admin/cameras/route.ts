import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";
import { saveCameraPresentation } from "@/zones/tank/server/cameraRegistryDb";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const snapshot = await getCameraDirectorySnapshot();
  return NextResponse.json({ ok: true, snapshot }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const { cameraId, description, accent, location, priority } = (body ?? {}) as Record<string, unknown>;
  if (typeof cameraId !== "string" || !cameraId.trim()) {
    return NextResponse.json({ error: "cameraId is required." }, { status: 400 });
  }

  const result = await saveCameraPresentation({
    cameraId: cameraId.trim(),
    description: typeof description === "string" ? description : "",
    accent: typeof accent === "string" ? accent : "from-slate-700/60 via-slate-900/70 to-black",
    location: typeof location === "string" ? location : "",
    priority: typeof priority === "number" && Number.isFinite(priority) ? priority : 0,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Failed to save camera presentation." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
