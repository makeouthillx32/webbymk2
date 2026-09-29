import { NextResponse } from "next/server";
import { getDirectorOverlay } from "@/zones/tank/house/directorOverlayWorkshop";
import { requireStaff } from "@/zones/tank/server/staffAuth";
import {
  readAllOverlaySettings,
  saveOverlaySettings,
} from "@/zones/tank/server/overlaySettingsStore";

// Settings for the OBS overlay browser sources.
//
// GET is deliberately UNAUTHENTICATED. An OBS browser source has no session and
// cannot be given one — a credential in a URL that lives inside a stream config
// is worse than anything this endpoint returns, which is caption text, toggle
// states and effect timings. Nothing here is a secret and nothing reveals
// anything the stream does not already show.
//
// POST is staff-only.

export const dynamic = "force-dynamic";

/** Overlay ids the workshop can edit, plus the composed programme page. */
const WRITABLE_IDS = new Set(["director", "hud", "attention", "vu", "crt", "goal"]);

export async function GET() {
  const settings = await readAllOverlaySettings();
  return NextResponse.json(
    { success: true, settings },
    {
      headers: {
        // Short cache with revalidation: a browser source polls this on load and
        // otherwise listens on realtime, so freshness comes from the broadcast
        // rather than from hammering this route.
        "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
      },
    },
  );
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = body as { overlayId?: string; settings?: unknown };
  const overlayId = typeof input?.overlayId === "string" ? input.overlayId.trim() : "";

  // Validated against the catalogue rather than trusted, so a typo cannot
  // create an orphan row that no overlay will ever read — the same invisible
  // failure as a mis-typed slug in the detection catalogue.
  if (!WRITABLE_IDS.has(overlayId)) {
    return NextResponse.json({ error: `Unknown overlay "${overlayId}"` }, { status: 400 });
  }
  if (overlayId !== "director" && !getDirectorOverlay(overlayId)) {
    return NextResponse.json(
      { error: `"${overlayId}" has no editor definition` },
      { status: 400 },
    );
  }

  const result = await saveOverlaySettings(overlayId, input?.settings, staff.id);
  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ success: true, settings: result.settings });
}
