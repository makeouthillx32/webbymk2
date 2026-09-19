import { createAdminClient } from "@/utils/supabase/admin";
import { FOLLOWABLE_MEMBERS } from "./followMember";

// Enrollment: teaching the house a person by following them around it -- a new
// guest, or a housemate the house already knows but not in every pose (Joe
// lying on the floor was the case that asked for it, 2026-09-19).
//
// The operator clears the house, names the guest, and switches the director to
// Enroll. From then on the one body the learner cannot put a known name to is
// the guest: the director follows it room to room exactly like Follow Member,
// and the learner collects every sighting of it pre-labelled with the guest's
// name. Finishing hands the sightings to the Label Lab for a last clean-up and
// rebuilds the gallery, after which every director mode knows the guest.

export const ENROLLMENT_KEY = "director_enrollment";
const RETRICKLE_KEY = "label_lab_retrickle";
const CACHE_MS = 10_000;

export type EnrollmentSession = {
  slug: string;
  name: string;
  /** A new guest (guest-<name>) or an existing housemate's slug. Absent = guest (older sessions). */
  kind?: "guest" | "member";
  startedAt: string;
  finishedAt: string | null;
  by: string;
};

const GUEST_SLUG = /^guest-((?:[1-9][0-9]{0,2})|(?:[a-z][a-z0-9-]{0,23}))$/;

/** "Andy" -> "guest-andy"; null when the name makes no usable slug. */
export function enrollmentSlug(name: string): string | null {
  const slug = `guest-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  return GUEST_SLUG.test(slug) ? slug : null;
}

let g_session: EnrollmentSession | null = null;
let g_loadedAt = 0;

/** The session in progress, or null. Cached briefly: the director asks every tick. */
export async function loadEnrollment(force = false): Promise<EnrollmentSession | null> {
  if (!force && Date.now() - g_loadedAt < CACHE_MS) return g_session;
  const { data, error } = await createAdminClient()
    .from("tank_platform_settings").select("value").eq("key", ENROLLMENT_KEY).maybeSingle();
  if (error) throw new Error(`Enrollment state unavailable: ${error.message}`);
  const value = data?.value as EnrollmentSession | undefined;
  g_session = value && value.slug && !value.finishedAt ? value : null;
  g_loadedAt = Date.now();
  return g_session;
}

/** Housemates that can be enrolled: people, not pets (pets are named from their own gallery). */
export function enrollableMember(slug: string): { slug: string; displayName: string } | null {
  const member = FOLLOWABLE_MEMBERS.find((m) => m.slug === slug && m.kind === "person");
  return member ? { slug: member.slug, displayName: member.displayName } : null;
}

/**
 * Start teaching the house a person. `member` (a housemate's slug) enrolls that
 * housemate in new poses; otherwise `name` becomes a new guest.
 */
export async function startEnrollment(name: string, by: string, member?: string | null): Promise<EnrollmentSession> {
  const housemate = member ? enrollableMember(member) : null;
  if (member && !housemate) throw new Error(`${member} is not a housemate that can be enrolled.`);
  const slug = housemate ? housemate.slug : enrollmentSlug(name);
  if (!slug) throw new Error("Give the guest a name with at least one letter.");
  const session: EnrollmentSession = {
    slug,
    name: housemate ? housemate.displayName : name.trim(),
    kind: housemate ? "member" : "guest",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    by,
  };
  const { error } = await createAdminClient().from("tank_platform_settings").upsert(
    { key: ENROLLMENT_KEY, value: session, updated_at: session.startedAt },
    { onConflict: "key" },
  );
  if (error) throw new Error(`Could not start enrollment: ${error.message}`);
  g_session = session;
  g_loadedAt = Date.now();
  return session;
}

/**
 * Ends the session and asks the learner to rebuild the gallery, so the guest's
 * sightings -- once confirmed in the Label Lab -- reach every director mode.
 */
export async function finishEnrollment(by: string): Promise<EnrollmentSession | null> {
  const session = await loadEnrollment(true);
  if (!session) return null;
  const now = new Date().toISOString();
  const admin = createAdminClient();
  const finished = { ...session, finishedAt: now };
  const { error } = await admin.from("tank_platform_settings").upsert(
    { key: ENROLLMENT_KEY, value: finished, updated_at: now },
    { onConflict: "key" },
  );
  if (error) throw new Error(`Could not finish enrollment: ${error.message}`);
  // The same job the Label Lab's Re-trickle button runs: rebuild from the
  // graded crops, then regroup any single-image cards.
  await admin.from("tank_platform_settings").upsert(
    { key: RETRICKLE_KEY, value: { status: "requested", requestedBy: by, reason: `enrollment of ${session.slug}`, updatedAt: now }, updated_at: now },
    { onConflict: "key" },
  );
  g_session = null;
  g_loadedAt = Date.now();
  return finished;
}

/** Guests the house has confirmed at least once, for the Follow Member picker. */
export async function listKnownGuests(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("tank_identity_clusters")
    .select("assigned_target_slug")
    .like("assigned_target_slug", "guest-%")
    .eq("status", "confirmed")
    .limit(2000);
  return [...new Set((data ?? []).map((row) => row.assigned_target_slug as string).filter((slug) => GUEST_SLUG.test(slug)))].sort();
}

/** Test seam. */
export function __resetEnrollment(): void {
  g_session = null;
  g_loadedAt = 0;
}
