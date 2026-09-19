import { NextResponse } from "next/server";
import { requireStaff } from "./staffAuth";
import { createClient } from "@/utils/supabase/server";
import {
  CHAOS_DIRECTOR_CATALOG,
  getActiveDecoupledPolicy,
  getActiveItemOverrides,
  triggerChaosCatalogItem,
  applyDirectorItemOverride,
  clearItemOverride,
} from "./directorPolicyHierarchy";
import { tickServerDirector } from "./serverDirectorEngine";

export const dynamic = "force-dynamic";

export async function handleDirectorOverrideGet() {
  const now = Date.now();
  const decoupledPolicy = getActiveDecoupledPolicy(now);
  const activeOverrides = getActiveItemOverrides(now);

  return NextResponse.json({
    success: true,
    hasActiveOverride: decoupledPolicy.hasActiveOverride,
    decoupledPolicy,
    activeOverrides,
    catalog: CHAOS_DIRECTOR_CATALOG,
  });
}

export async function handleDirectorOverridePost(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Determine triggerer identity (staff, authenticated user, or viewer)
  let staff = null;
  try {
    staff = await requireStaff();
  } catch {
    staff = null;
  }

  let triggeredBy = body.triggeredBy;
  if (staff) {
    triggeredBy = triggeredBy || `${staff.role}:${staff.id.slice(0, 6)}`;
  } else if (!triggeredBy) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        triggeredBy = `user:${user.id.slice(0, 6)}`;
      }
    } catch {
      // Non-request environment fallback
    }
    triggeredBy = triggeredBy || "Viewer";
  }

  let override;
  if (body.itemSlug && CHAOS_DIRECTOR_CATALOG.some((c) => c.slug === body.itemSlug)) {
    override = triggerChaosCatalogItem(body.itemSlug, {
      targetRoomKey: body.targetRoomKey,
      targetCameraId: body.targetCameraId,
      triggeredBy,
      durationSeconds: body.durationSeconds,
    });
  } else if (body.itemName || body.itemSlug) {
    override = applyDirectorItemOverride({
      itemSlug: body.itemSlug || "custom-override",
      itemName: body.itemName || "Director Override",
      targetMode: body.targetMode,
      targetDetectionMode: body.targetDetectionMode,
      targetFramingMode: body.targetFramingMode,
      targetRoomKey: body.targetRoomKey,
      targetCameraId: body.targetCameraId,
      targetSpeed: body.targetSpeed,
      chaosHopIntervalMs: body.chaosHopIntervalMs,
      overrideRoomLock: body.overrideRoomLock,
      triggeredBy,
      durationSeconds: body.durationSeconds,
    });
  } else {
    return NextResponse.json(
      { error: "Must specify a valid itemSlug from catalog or item details" },
      { status: 400 }
    );
  }

  // Force an immediate tick so changes take effect without waiting for background interval
  const serverDirectorState = await tickServerDirector();

  return NextResponse.json({
    success: true,
    override,
    policy: getActiveDecoupledPolicy(),
    serverDirectorState,
  });
}

export async function handleDirectorOverrideDelete(request: Request) {
  const staff = await requireStaff();
  if (!staff) {
    return NextResponse.json(
      { error: "Staff authorization required to dismiss active overrides" },
      { status: 403 }
    );
  }

  clearItemOverride();
  const serverDirectorState = await tickServerDirector();

  return NextResponse.json({
    success: true,
    message: "Active director overrides cleared",
    serverDirectorState,
  });
}
