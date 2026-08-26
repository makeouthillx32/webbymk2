import { randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { obsRoomPreviewMediaPath } from "../mediaPlayback";
import { mediaMtxHeaders, provisionObsWhepSibling, teardownObsWhepSibling } from "./mediaGateway";

// Tank-issued OBS ingest rooms.
//
// Tank mints the key, authorises the publish, and runs the room lifecycle.
// MediaMTX asks Tank on every publish attempt (authMethod: http) and reports
// signal start/stop back through runOnReady / runOnNotReady, so a room exists
// for viewers exactly while a stream is actually arriving.
//
// Server-only utilities; no "use server" directive — see archiveDrain.ts.

/** Path prefix every OBS ingest lives under, e.g. obs/skillet. */
export const OBS_PATH_PREFIX = "obs";

export type ObsRoom = {
  id: string;
  ownerUserId: string;
  slug: string;
  title: string;
  isLive: boolean;
  /** True only after MediaMTX reports the Opus WHEP sibling ready. */
  whepReady: boolean;
  lastSignalAt: string | null;
};

/** What the owner is shown so they can configure OBS. Includes the secret. */
export type ObsRoomCredentials = ObsRoom & {
  streamKey: string;
  /** Goes in OBS/Streamlabs "Server". */
  serverUrl: string;
  /** Goes in OBS/Streamlabs "Stream Key". */
  obsStreamKey: string;
  /** Where viewers watch once signal arrives. */
  playbackPath: string;
};

function mapRow(row: Record<string, any>): ObsRoom {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    slug: row.slug,
    title: row.title,
    isLive: Boolean(row.is_live),
    whepReady: false,
    lastSignalAt: row.last_signal_at ?? null,
  };
}

function generateStreamKey(): string {
  // URL-safe: it travels in an RTMP query string, so + and / would need
  // escaping that OBS users would inevitably paste wrong.
  return randomBytes(24).toString("base64url");
}

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return /^[a-z0-9][a-z0-9-]{1,48}$/.test(slug) ? slug : fallback;
}

function rtmpServerUrl(): string {
  return process.env.TANK_RTMP_PUBLIC_URL || "rtmp://media.tank.unenter.live:1935";
}

function buildCredentials(room: ObsRoom, streamKey: string): ObsRoomCredentials {
  return {
    ...room,
    streamKey,
    // OBS splits the destination into Server + Stream Key. MediaMTX takes the
    // credentials from the query string, so the slug lands in the Stream Key
    // field alongside them — that keeps the secret out of the Server URL and
    // out of every public playback URL.
    serverUrl: `${rtmpServerUrl()}/${OBS_PATH_PREFIX}`,
    obsStreamKey: `${room.slug}?user=${room.slug}&pass=${streamKey}`,
    playbackPath: `${OBS_PATH_PREFIX}/${room.slug}`,
  };
}

/**
 * The caller's room, creating it on first request.
 *
 * One room per account (enforced by a UNIQUE on owner_user_id), so calling
 * this repeatedly is safe and always returns the same room and key rather than
 * minting a new one.
 */
export async function getOrCreateMyObsRoom(): Promise<
  { success: true; room: ObsRoomCredentials } | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const admin = createAdminClient();

  // Rooms are staff-issued for now. Gate on the profile role rather than
  // anything the client sends.
  const { data: profile } = await admin
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role || "user";
  if (role !== "admin" && role !== "moderator") {
    return { success: false, error: "OBS rooms are staff-only." };
  }

  const { data: existing } = await admin
    .from("tank_obs_rooms")
    .select("*")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (existing) {
    return { success: true, room: buildCredentials(mapRow(existing), existing.stream_key) };
  }

  const displayName = profile?.display_name || user.email?.split("@")[0] || "staff";
  const base = slugify(displayName, `room-${user.id.slice(0, 8)}`);

  // Slug collisions are possible across different accounts with the same
  // display name; fall back to something unique rather than failing.
  let slug = base;
  const { data: clash } = await admin
    .from("tank_obs_rooms")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (clash) slug = `${base}-${user.id.slice(0, 6)}`.slice(0, 48);

  const streamKey = generateStreamKey();
  const { data, error } = await admin
    .from("tank_obs_rooms")
    .insert({
      owner_user_id: user.id,
      slug,
      title: displayName,
      stream_key: streamKey,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Could not create room." };
  }

  return { success: true, room: buildCredentials(mapRow(data), streamKey) };
}

/** Issues a fresh key, immediately invalidating the old one. */
export async function rotateMyStreamKey(): Promise<
  { success: true; room: ObsRoomCredentials } | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const admin = createAdminClient();
  const streamKey = generateStreamKey();

  const { data, error } = await admin
    .from("tank_obs_rooms")
    .update({ stream_key: streamKey, updated_at: new Date().toISOString() })
    .eq("owner_user_id", user.id)
    .select("*")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "No room to rotate." };
  return { success: true, room: buildCredentials(mapRow(data), streamKey) };
}

/**
 * Constant-time comparison. A plain `===` on a secret leaks its length and,
 * across enough attempts, its content through timing.
 */
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type PublishAuthInput = {
  path: string;
  user: string;
  password: string;
  ip: string | null;
  action: string;
};

/**
 * Decides whether MediaMTX should accept a publish.
 *
 * Only publishes are routed here — reads and playback are excluded in
 * mediamtx.yml so anonymous viewing keeps working without Tank being in the
 * path of every viewer.
 */
export async function authorizePublish(
  input: PublishAuthInput,
): Promise<{ allowed: boolean; reason: string }> {
  if (input.action !== "publish") {
    // Anything that is not a publish should have been excluded upstream.
    // Refuse rather than guess.
    return { allowed: false, reason: `unexpected action '${input.action}'` };
  }

  // Tank's own camera pipeline republishes over loopback RTSP inside the
  // MediaMTX container (see mediaGateway.ts). Those publishes carry no
  // credentials and must keep working, but only from inside the container.
  if (isLoopback(input.ip) && !input.path.startsWith(`${OBS_PATH_PREFIX}/`)) {
    return { allowed: true, reason: "internal loopback republish" };
  }

  // Same story for an OBS room's own WHEP transcode sibling
  // (provisionObsWhepSibling in mediaGateway.ts) — also a loopback
  // republish, but it lives under obs/*, so the check above deliberately
  // skips it (real protection: an attacker on localhost still can't
  // publish to an arbitrary obs/<slug> without its stream key). Confirmed
  // live 2026-08-23: without this, every publish attempt on the sibling
  // got "missing credentials", so the path never came up at all and every
  // OBS viewer got a WHEP 404 -> HLS fallback instead of the low-latency
  // path the sibling exists for. Scoped to the -whep suffix specifically,
  // not all of obs/*, so a real stream key is still required on the room's
  // own base path.
  if (
    isLoopback(input.ip) &&
    input.path.startsWith(`${OBS_PATH_PREFIX}/`) &&
    input.path.endsWith("-whep")
  ) {
    return { allowed: true, reason: "internal WHEP sibling republish" };
  }

  if (!input.path.startsWith(`${OBS_PATH_PREFIX}/`)) {
    return { allowed: false, reason: "publishing is only open on obs/* paths" };
  }

  const slug = input.path.slice(OBS_PATH_PREFIX.length + 1);
  if (!slug || !input.password) return { allowed: false, reason: "missing credentials" };

  const admin = createAdminClient();
  const { data: room } = await admin
    .from("tank_obs_rooms")
    .select("slug, stream_key")
    .eq("slug", slug)
    .maybeSingle();

  if (!room) return { allowed: false, reason: "unknown room" };
  if (!secretsMatch(input.password, room.stream_key)) {
    return { allowed: false, reason: "bad stream key" };
  }

  return { allowed: true, reason: "ok" };
}

function isLoopback(ip: string | null): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/**
 * Signal started or stopped. Driven by MediaMTX runOnReady / runOnNotReady, so
 * the room appears for viewers only while a stream is genuinely arriving and
 * disappears the moment it stops — no manual teardown, no ghost rooms.
 */
export async function setObsRoomSignal(
  slug: string,
  live: boolean,
  publishIp?: string | null,
): Promise<boolean> {
  const admin = createAdminClient();

  // Do not advertise the room until its low-latency sibling has had a chance
  // to become readable. The HLS path remains a safe fallback if provisioning
  // fails or readiness times out, but viewers never receive a knowingly-dead
  // WHEP URL during the normal stream-start edge.
  if (live) {
    const provisioned = await provisionObsWhepSibling(slug).catch(() => ({ ok: false }));
    if (provisioned.ok) await waitForObsPathReady(slug, true);
  }

  const { error } = await admin
    .from("tank_obs_rooms")
    .update({
      is_live: live,
      last_signal_at: new Date().toISOString(),
      ...(live && publishIp ? { last_publish_ip: publishIp } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug);

  if (!live) await teardownObsWhepSibling(slug).catch(() => {});

  return !error;
}

/**
 * Cross-checks a room against MediaMTX's own live path state.
 *
 * `is_live` is set only by setObsRoomSignal, driven by runOnReady/
 * runOnNotReady — an event, not a lease. If MediaMTX itself dies or the host
 * restarts uncleanly while a room is live, runOnNotReady never fires and
 * `is_live` stays true forever with nothing to correct it, even with OBS
 * closed (confirmed 2026-08-22, after a host restart during an active OBS
 * stream). Returns false only on a definitive "not live" (MediaMTX up and
 * reporting the path isn't ready, or the path doesn't exist at all) — null
 * means "couldn't tell", which must never be treated as proof of absence, or
 * a momentary MediaMTX/network hiccup would evict every OBS room at once.
 */
export async function isObsPathReady(
  slug: string,
  sibling: boolean | "preview" = false,
): Promise<boolean | null> {
  const apiBase = process.env.MEDIAMTX_API_URL;
  if (!apiBase) return null;
  try {
    const apiUrl = new URL(apiBase);
    const path = sibling === "preview"
      ? obsRoomPreviewMediaPath(slug)
      : `${OBS_PATH_PREFIX}/${slug}${sibling === true ? "-whep" : ""}`;
    const response = await fetch(
      new URL(
        `/v3/paths/get/${encodeURIComponent(path)}`,
        apiUrl,
      ),
      { method: "GET", headers: mediaMtxHeaders(), cache: "no-store" },
    );
    if (response.status === 404) return false;
    if (!response.ok) return null;
    const body = (await response.json()) as { ready?: boolean };
    return body.ready === true;
  } catch {
    return null;
  }
}

async function waitForObsPathReady(
  slug: string,
  whepSibling: boolean,
  attempts = 8,
  intervalMs = 175,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isObsPathReady(slug, whepSibling)) return true;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}

export function resolveObsRoomReadiness(
  room: ObsRoom,
  sourceReady: boolean | null,
  whepReady: boolean,
): ObsRoom {
  const isLive = sourceReady ?? room.isLive;
  return { ...room, isLive, whepReady: isLive && whepReady };
}

/**
 * Every registered OBS room, reconciled in both directions against MediaMTX.
 * Returning offline rows is intentional: deriveRooms() needs a camera group
 * before a tank_rooms always-show override can render its standby state.
 */
export async function getObsRooms(): Promise<ObsRoom[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tank_obs_rooms")
      .select("*")
      .order("slug");
    const candidates = (data ?? []).map(mapRow);
    if (!candidates.length) return candidates;

    const checked = await Promise.all(
      candidates.map(async (room) => {
        const sourceReady = await isObsPathReady(room.slug);
        let whepReady = false;

        if (sourceReady === true) {
          const [currentWhepReady, previewReady] = await Promise.all([
            isObsPathReady(room.slug, true),
            isObsPathReady(room.slug, "preview"),
          ]);
          whepReady = currentWhepReady === true;
          if (!whepReady || previewReady !== true) {
            const provisioned = await provisionObsWhepSibling(room.slug).catch(() => ({ ok: false }));
            if (provisioned.ok) whepReady = await waitForObsPathReady(room.slug, true);
          }
        } else if (sourceReady === false && room.isLive) {
          await teardownObsWhepSibling(room.slug).catch(() => {});
        }

        return {
          previous: room,
          room: resolveObsRoomReadiness(room, sourceReady, whepReady),
          sourceReady,
        };
      }),
    );

    const stale = checked
      .filter((entry) => entry.sourceReady === false && entry.previous.isLive)
      .map((entry) => entry.room.slug);
    const recovered = checked
      .filter((entry) => entry.sourceReady === true && !entry.previous.isLive)
      .map((entry) => entry.room.slug);
    if (stale.length) {
      await admin
        .from("tank_obs_rooms")
        .update({ is_live: false, updated_at: new Date().toISOString() })
        .in("slug", stale);
    }
    if (recovered.length) {
      await admin
        .from("tank_obs_rooms")
        .update({ is_live: true, updated_at: new Date().toISOString() })
        .in("slug", recovered);
    }

    return checked.map((entry) => entry.room);
  } catch {
    return [];
  }
}

/** Compatibility helper for callers that truly need only active rows. */
export async function getLiveObsRooms(): Promise<ObsRoom[]> {
  return (await getObsRooms()).filter((room) => room.isLive);
}
