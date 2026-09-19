import { NextResponse } from "next/server";
import { checkStaff, staffDenialResponse } from "@/zones/tank/server/staffAuth";
import { FOLLOWABLE_MEMBERS, followableWithGuests, isFollowableSlug } from "@/zones/tank/server/followMember";
import { finishEnrollment, listKnownGuests, loadEnrollment, startEnrollment } from "@/zones/tank/server/enrollmentStore";
import {
  getEffectiveMode,
  getFollowMember,
  getOperatorMode,
  loadPersistedOperatorModeFromDb,
  persistOperatorModeToDb,
  SUBJECT_MODES,
} from "@/zones/tank/server/directorTelemetryStore";

// Lets an operator choose what the director is looking for.
//
// Until now the subject mode could only arrive attached to a telemetry post,
// so the configuration screen could show nine modes while the live director
// respected none of them — picking "group" changed nothing. This is the
// control surface that makes the selection real.
//
// Staff-authenticated rather than shared-secret: a person is choosing this,
// not a detector, and it changes what every viewer sees.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await loadPersistedOperatorModeFromDb(true);
    const [guests, enrollment, access] = await Promise.all([
      listKnownGuests().catch(() => [] as string[]),
      loadEnrollment(true).catch(() => null),
      checkStaff().catch(() => ({ staff: null, denial: "unavailable" as const })),
    ]);
    return NextResponse.json({
      success: true,
      operatorMode: getOperatorMode(),
      effectiveMode: getEffectiveMode(),
      followMember: getFollowMember(),
      followable: followableWithGuests(guests),
      enrollment,
      available: SUBJECT_MODES,
      authority: "server-database",
      // Whether THIS browser may change the director, and if not why -- so the
      // console can lock its controls up front instead of failing on click.
      canControl: Boolean(access.staff),
      denial: access.denial,
    });
  } catch (error) {
    console.error("[DirectorMode] Failed to attach to durable mode:", error);
    return NextResponse.json({ error: "Director mode unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { staff, denial } = await checkStaff();
  if (!staff) {
    const { status, body } = staffDenialResponse(denial ?? "unavailable");
    return NextResponse.json(body, { status });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Finishing an enrollment ends the session, asks the learner to rebuild the
  // gallery, and switches to following the new guest so the operator can see
  // straight away whether the house now knows them.
  if (body?.finishEnrollment === true) {
    try {
      const finished = await finishEnrollment(`${staff.role}:${staff.id}`);
      if (finished) await persistOperatorModeToDb("member", `${staff.role}:${staff.id}`, finished.slug);
      return NextResponse.json({
        success: true,
        enrollment: null,
        finished,
        operatorMode: getOperatorMode(),
        effectiveMode: getEffectiveMode(),
        followMember: getFollowMember(),
        authority: "server-database",
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not finish enrollment" }, { status: 503 });
    }
  }

  // Starting one needs the guest's name; switching back to Enroll while a
  // session is open just resumes it.
  if (body?.mode === "enroll") {
    try {
      const open = await loadEnrollment(true);
      if (!open) {
        const name = typeof body?.enrollName === "string" ? body.enrollName : "";
        const member = typeof body?.enrollMember === "string" ? body.enrollMember : null;
        if (!member && !name.trim()) {
          return NextResponse.json({ error: "Pick a housemate or name the guest you are enrolling." }, { status: 400 });
        }
        await startEnrollment(name, `${staff.role}:${staff.id}`, member);
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start enrollment" }, { status: 400 });
    }
  }

  // null is a real choice: it hands control back to the detector's suggestion.
  const mode = body?.mode ?? null;
  if (mode !== null && !SUBJECT_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `mode must be null or one of: ${SUBJECT_MODES.join(", ")}` },
      { status: 400 },
    );
  }

  // Optional: omitted keeps the current member, null clears it.
  const followMember = body?.followMember;
  if (followMember !== undefined && followMember !== null && !isFollowableSlug(followMember)) {
    return NextResponse.json(
      { error: `followMember must be null, a guest-* slug, or one of: ${FOLLOWABLE_MEMBERS.map((m) => m.slug).join(", ")}` },
      { status: 400 },
    );
  }

  try {
    await persistOperatorModeToDb(mode, `${staff.role}:${staff.id}`, followMember);
    return NextResponse.json({
      success: true,
      operatorMode: getOperatorMode(),
      effectiveMode: getEffectiveMode(),
      followMember: getFollowMember(),
      enrollment: await loadEnrollment().catch(() => null),
      authority: "server-database",
    });
  } catch (error) {
    console.error("[DirectorMode] Failed to persist mode:", error);
    return NextResponse.json({ error: "Director mode was not saved" }, { status: 503 });
  }
}
