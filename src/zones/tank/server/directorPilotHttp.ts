import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  claimOrRenewPilotLease,
  getActivePilotLease,
  releasePilotLease,
  type PilotConnectionType,
} from "./manualPilotStore";
import { tickServerDirector } from "./serverDirectorEngine";
import type { VirtualPtzState } from "../director-configuration/components/NavigationController";

const CONNECTION_TYPES = new Set<PilotConnectionType>([
  "browser_web",
  "touchdesigner",
  "osc",
  "gamepad",
]);

function sanitizePtzState(value: unknown): Partial<VirtualPtzState> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const number = (key: string, fallback: number) =>
    typeof input[key] === "number" && Number.isFinite(input[key]) ? (input[key] as number) : fallback;
  const zoomFactor = Math.min(3, Math.max(1, number("zoomFactor", 1)));
  const maxPanX = 3840 - 3840 / zoomFactor;
  const maxPanY = 2160 - 2160 / zoomFactor;
  return {
    zoomFactor,
    panOffsetX: Math.min(maxPanX, Math.max(0, number("panOffsetX", 0))),
    panOffsetY: Math.min(maxPanY, Math.max(0, number("panOffsetY", 0))),
    zoomSpeed: Math.min(10, Math.max(1, number("zoomSpeed", 5))),
    speedMode: input.speedMode === "sport" ? "sport" : "fine",
  };
}

export async function handleDirectorPilotGet() {
  const access = await requireAdmin();
  if (access.error) return access.error;

  try {
    const activePilot = await getActivePilotLease();
    return NextResponse.json({ success: true, activePilot, isLocked: activePilot !== null });
  } catch (error) {
    console.error("[DirectorPilot] failed to read pilot lease:", error);
    return NextResponse.json({ error: "Director control state unavailable" }, { status: 503 });
  }
}

export async function handleDirectorPilotPost(request: Request) {
  const access = await requireAdmin();
  if (access.error) return access.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action === "release" ? "release" : "claim";
  const clientPilotId = typeof body.pilotId === "string" ? body.pilotId.slice(0, 160) : "admin-session";
  const pilotId = `${access.userId}:${clientPilotId}`;

  try {
    if (action === "release") {
      const released = await releasePilotLease(pilotId);
      const state = await tickServerDirector();
      return NextResponse.json({
        success: true,
        released,
        activePilot: await getActivePilotLease(),
        directorState: state,
      });
    }

    const activeCameraId = typeof body.activeCameraId === "string" ? body.activeCameraId : "";
    const activeRoomKey = typeof body.activeRoomKey === "string" ? body.activeRoomKey : "";
    if (!activeCameraId || !activeRoomKey) {
      return NextResponse.json({ error: "Camera and room are required" }, { status: 400 });
    }

    const requestedConnectionType = body.connectionType as PilotConnectionType;
    const connectionType = CONNECTION_TYPES.has(requestedConnectionType)
      ? requestedConnectionType
      : "browser_web";

    const { data: profile } = await access.admin
      .from("profiles")
      .select("display_name")
      .eq("id", access.userId)
      .maybeSingle();

    const result = await claimOrRenewPilotLease({
      pilotUser: profile?.display_name || "Admin",
      pilotId,
      connectionType,
      activeCameraId: activeCameraId.slice(0, 200),
      activeRoomKey: activeRoomKey.slice(0, 200),
      ptzState: sanitizePtzState(body.ptzState),
      forceTakeover: body.forceTakeover === true,
    });

    const directorState = result.success ? await tickServerDirector() : null;
    return NextResponse.json({ ...result, directorState }, { status: result.success ? 200 : 409 });
  } catch (error) {
    console.error("[DirectorPilot] command failed:", error);
    return NextResponse.json({ error: "Director command failed" }, { status: 503 });
  }
}
