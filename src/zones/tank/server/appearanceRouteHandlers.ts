import { NextResponse } from "next/server";
import { describeCaptures, enqueueCapture } from "./appearanceCaptureQueue";
import {
  deleteEnrolment,
  listEnrolments,
  setEnrolmentActive,
} from "./appearanceEnrolmentDb";
import { requireStaff } from "./staffAuth";
import { getIdentityTrainingSummary } from "./identityTrainingDb";
import {
  getServerAppearanceStatus,
  isServerDetectionActive,
} from "./directorTelemetryStore";

// Shared route implementation for both the core app and the Tank zone app.
// This deliberately lives outside src/app: during a Tank image build the zone
// route tree replaces src/app, so a zone route cannot safely re-export another
// module through the @/app alias without resolving back to itself.

/** What is enrolled, plus any capture still in flight. */
export async function GET() {
  const staff = await requireStaff();
  if (!staff)
    return NextResponse.json(
      { error: "Staff access required." },
      { status: 403 },
    );

  try {
    const [enrolments, captures, identityIndex] = await Promise.all([
      listEnrolments(),
      Promise.resolve(describeCaptures()),
      getIdentityTrainingSummary(),
    ]);
    return NextResponse.json({
      success: true,
      enrolments,
      identityIndex,
      runtimeIdentity: {
        workerOnline: isServerDetectionActive(),
        appearance: getServerAppearanceStatus(),
      },
      ...captures,
    });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

/** Queue a worker-side appearance capture from its decoded camera frame. */
export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff)
    return NextResponse.json(
      { error: "Staff access required." },
      { status: 403 },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = body as {
    targetSlug?: string;
    cameraId?: string;
    note?: string;
    mode?: "single" | "burst";
    burstDurationMs?: number;
    burstTargetCount?: number;
  };
  const result = enqueueCapture({
    targetSlug: String(input?.targetSlug ?? ""),
    cameraId: String(input?.cameraId ?? ""),
    mode: input?.mode === "burst" ? "burst" : "single",
    burstDurationMs:
      typeof input?.burstDurationMs === "number"
        ? input.burstDurationMs
        : undefined,
    burstTargetCount:
      typeof input?.burstTargetCount === "number"
        ? input.burstTargetCount
        : undefined,
    note: input?.note ?? null,
    requestedBy: staff.id,
  });

  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, request: result.request });
}

/** Retire or restore an enrolment without deleting its diagnostic history. */
export async function PATCH(request: Request) {
  const staff = await requireStaff();
  if (!staff)
    return NextResponse.json(
      { error: "Staff access required." },
      { status: 403 },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = body as { id?: string; isActive?: boolean };
  if (typeof input?.id !== "string" || typeof input?.isActive !== "boolean") {
    return NextResponse.json(
      { error: "Expected { id, isActive }" },
      { status: 400 },
    );
  }

  try {
    await setEnrolmentActive(input.id, input.isActive);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

/** Permanently remove a capture that belongs to the wrong person. */
export async function DELETE(request: Request) {
  const staff = await requireStaff();
  if (!staff)
    return NextResponse.json(
      { error: "Staff access required." },
      { status: 403 },
    );

  const id = new URL(request.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await deleteEnrolment(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
