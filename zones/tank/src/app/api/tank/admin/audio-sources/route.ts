import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  createTankAudioSource,
  deleteTankAudioSource,
  loadTankAudioSources,
  updateTankAudioSource,
} from "@/zones/tank/server/cameraRegistryDb";

export const dynamic = "force-dynamic";

const VALID_KINDS = ["ip-mic", "line-in", "house-mic"] as const;
const ROOM_SCOPE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function parseSourceInput(body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const roomScope = typeof body.roomScope === "string" ? body.roomScope.trim() : "";
  const kind = body.kind;
  const connectionHint =
    typeof body.connectionHint === "string" && body.connectionHint.trim()
      ? body.connectionHint.trim()
      : null;

  if (!id) return { error: "id is required." } as const;
  if (!name) return { error: "name is required." } as const;
  if (!ROOM_SCOPE_PATTERN.test(roomScope)) {
    return { error: "roomScope must be lowercase, kebab-case (e.g. game-room)." } as const;
  }
  if (typeof kind !== "string" || !VALID_KINDS.includes(kind as (typeof VALID_KINDS)[number])) {
    return { error: "kind must be one of ip-mic, line-in, house-mic." } as const;
  }

  return {
    value: { id, name, roomScope, kind: kind as (typeof VALID_KINDS)[number], connectionHint },
  } as const;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const sources = await loadTankAudioSources();
  return NextResponse.json({ ok: true, sources }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const parsed = parseSourceInput((body ?? {}) as Record<string, unknown>);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await createTankAudioSource(parsed.value);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Failed to create audio source." }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
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

  const parsed = parseSourceInput((body ?? {}) as Record<string, unknown>);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await updateTankAudioSource(parsed.value);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Failed to update audio source." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query parameter is required." }, { status: 400 });

  const result = await deleteTankAudioSource(id);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Failed to delete audio source." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
