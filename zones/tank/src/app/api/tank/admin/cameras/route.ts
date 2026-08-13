import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireAdminClient } from "@/lib/require-admin";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const access = await requireAdminClient(supabase);
  if (!access.ok)
    return NextResponse.json(
      { error: access.message },
      { status: access.status },
    );
  return NextResponse.json(await getCameraDirectorySnapshot(), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
