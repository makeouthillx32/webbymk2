import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient } from "@/lib/require-admin";
import { createClient } from "@/utils/supabase/server";
import { provisionMediaMtxCamera } from "@/zones/tank/server/mediaGateway";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const access = await requireAdminClient(supabase);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status },
    );
  }

  let cameraId: unknown;
  try {
    cameraId = (await request.json() as { cameraId?: unknown }).cameraId;
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  if (typeof cameraId !== "string" || !cameraId.trim()) {
    return NextResponse.json({ error: "cameraId is required." }, { status: 400 });
  }

  const result = await provisionMediaMtxCamera(cameraId.trim());
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
