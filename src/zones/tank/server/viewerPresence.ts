import { createHash } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";

// Server-side viewer presence: everyone looking at the feed, signed in or not.
//
// Server-side on purpose. A browser cannot see its own public IP, and anything
// it reports about itself is a claim rather than a fact. The heartbeat endpoint
// sees the real connection, so identity, grouping and automated-client classification are decided
// here where they can't be spoofed by a client.

/** A viewer counts as online this long after their last heartbeat. */
export const PRESENCE_TTL_SECONDS = 45;

/** How often the client should ping. Comfortably inside the TTL. */
export const HEARTBEAT_INTERVAL_SECONDS = 20;

export type ConnectionType = "cellular" | "wifi" | "ethernet" | "unknown";
type StoredClientKind = "human" | "bot";

export type PresenceSnapshot = {
  /** Real people watching; automated traffic never inflates this number. */
  online: number;
  members: number;
  anonymous: number;
  automated: number;
  onCellular: number;
  /** Connections with more than one viewer behind them (a house, an office). */
  groups: { label: string | null; viewers: number }[];
};

// ── Anonymous names ─────────────────────────────────────────────────────────
// Deterministic from the viewer key, so the same device keeps the same name
// across visits without storing anything extra to look up.
const ADJECTIVES = [
  "Quiet", "Restless", "Nocturnal", "Polite", "Feral", "Distant", "Curious",
  "Patient", "Sudden", "Damp", "Electric", "Hollow", "Velvet", "Crooked",
  "Lucky", "Static", "Midnight", "Copper", "Salted", "Drifting",
];

const NOUNS = [
  "Lurker", "Onlooker", "Bystander", "Spectator", "Witness", "Regular",
  "Nightowl", "Guest", "Passerby", "Observer", "Visitor", "Watcher",
  "Shadow", "Ghost", "Signal", "Pigeon", "Moth", "Raccoon", "Gremlin", "Possum",
];

export function generateAnonName(viewerKey: string): string {
  const digest = createHash("sha256").update(viewerKey).digest();
  const adjective = ADJECTIVES[digest[0] % ADJECTIVES.length];
  const noun = NOUNS[digest[1] % NOUNS.length];
  // Two digits keep collisions rare without making the name look like an ID.
  const suffix = ((digest[2] << 8) | digest[3]) % 100;
  return `${adjective}${noun}${String(suffix).padStart(2, "0")}`;
}

// ── Client classification ───────────────────────────────────────────────────

const BOT_PATTERN =
  /bot|crawl|spider|slurp|scrape|curl|wget|python-requests|headless|axios|phantomjs|monitoring|uptime|preview|fetch/i;

/**
 * Automated clients are tracked separately for operations but never included
 * in the real-person audience number.
 */
export function classifyClient(userAgent: string | null): StoredClientKind {
  if (!userAgent || !userAgent.trim()) return "bot";
  return BOT_PATTERN.test(userAgent) ? "bot" : "human";
}

/**
 * The client reports its own connection type from the Network Information API.
 * That API is Chromium-only and reports `undefined` on Safari and Firefox, so
 * this is a hint for colour, never a number to make decisions on — the honest
 * answer for most iPhone viewers is "unknown", not "wifi".
 */
export function normalizeConnectionType(raw: unknown): ConnectionType {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value === "cellular" || value === "wifi" || value === "ethernet") return value;
  return "unknown";
}

// ── IP handling ─────────────────────────────────────────────────────────────

/**
 * The real client address, taken from the first hop in x-forwarded-for.
 *
 * Everything reaches Tank through NPM and the internal proxy, so the socket
 * address is always a container. The leftmost XFF entry is the original client;
 * later entries are our own hops.
 */
export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

/**
 * Salted hash of the address. Grouping viewers who share a connection does not
 * require keeping the addresses themselves, and a plain hash of an IPv4 space
 * is trivially reversible by brute force — hence the salt.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.TANK_PRESENCE_IP_SALT;
  if (!salt) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export type HeartbeatInput = {
  viewerKey: string;
  roomSlug?: string;
  connectionType?: unknown;
  userAgent: string | null;
  ip: string | null;
  userId?: string | null;
};

export type HeartbeatResult = {
  you: { name: string; isAnonymous: boolean };
  presence: PresenceSnapshot;
};

export async function recordHeartbeat(input: HeartbeatInput): Promise<HeartbeatResult> {
  const admin = createAdminClient();

  const viewerKey = input.viewerKey.slice(0, 128);
  const anonName = generateAnonName(viewerKey);
  const now = new Date().toISOString();

  await admin.from("tank_viewer_sessions").upsert(
    {
      viewer_key: viewerKey,
      ip_hash: hashIp(input.ip),
      user_id: input.userId ?? null,
      anon_name: anonName,
      room_slug: input.roomSlug?.slice(0, 64) || "director",
      connection_type: normalizeConnectionType(input.connectionType),
      client_kind: classifyClient(input.userAgent),
      last_seen_at: now,
    },
    { onConflict: "viewer_key" },
  );

  const presence = await getPresenceSnapshot();
  // Fan the new number out to everyone else rather than making them wait for
  // their own next beat.
  void broadcastPresenceIfChanged(presence);

  return {
    you: { name: anonName, isAnonymous: !input.userId },
    presence,
  };
}

// Short-lived shared snapshot.
//
// Every viewer heartbeats, and every heartbeat wants the current count. Without
// this, a room of N viewers runs N queries per interval for an answer that is
// identical for all of them. One query per second is plenty for a number that
// moves in whole people.
let cachedSnapshot: { at: number; value: PresenceSnapshot } | null = null;
const SNAPSHOT_CACHE_MS = 1000;

export async function getPresenceSnapshot(force = false): Promise<PresenceSnapshot> {
  const now = Date.now();
  if (!force && cachedSnapshot && now - cachedSnapshot.at < SNAPSHOT_CACHE_MS) {
    return cachedSnapshot.value;
  }

  const admin = createAdminClient();

  // Counted in Postgres. The previous version pulled every live session row
  // (LIMIT 10000) and counted them in JS on EVERY heartbeat — cost grew with
  // the square of the audience, because both the row count and the number of
  // heartbeats scale with viewers. This returns one row of scalars.
  const { data, error } = await admin.rpc("tank_human_presence_snapshot", {
    p_ttl_seconds: PRESENCE_TTL_SECONDS,
  });

  const row = Array.isArray(data) ? data[0] : data;

  const value: PresenceSnapshot = error || !row
    ? { online: 0, members: 0, anonymous: 0, automated: 0, onCellular: 0, groups: [] }
    : {
        online: Number(row.online) || 0,
        members: Number(row.members) || 0,
        anonymous: Number(row.anonymous) || 0,
        automated: Number(row.automated) || 0,
        onCellular: Number(row.on_cellular) || 0,
        // Only the count of shared connections travels now, not a list of
        // them: the list was never rendered, and shipping per-connection rows
        // to every viewer is a visitor log nobody asked for.
        groups: Number(row.shared_connections) > 0
          ? [{ label: null, viewers: Number(row.shared_connections) }]
          : [],
      };

  cachedSnapshot = { at: now, value };
  return value;
}

/**
 * Pushes the live count to everyone watching, so the number moves the moment
 * someone joins or leaves instead of on each viewer's own 20s heartbeat.
 *
 * Only fires when the count actually changed — a broadcast per heartbeat would
 * reintroduce exactly the per-viewer cost the aggregate above removed.
 */
let lastBroadcastOnline = -1;
async function broadcastPresenceIfChanged(snapshot: PresenceSnapshot): Promise<void> {
  if (snapshot.online === lastBroadcastOnline) return;
  lastBroadcastOnline = snapshot.online;
  try {
    const admin = createAdminClient();
    const channel = admin.channel(PRESENCE_CHANNEL);
    try {
      await channel.httpSend("presence", snapshot);
    } finally {
      await admin.removeChannel(channel);
    }
  } catch {
    // Presence is a nice-to-have; viewers still converge via their own beat.
  }
}

/** Channel the client subscribes to for live count pushes. */
export const PRESENCE_CHANNEL = "tank:presence";

/**
 * Drops sessions that stopped heartbeating a while ago. Presence is a live
 * signal, so the table should stay small rather than accumulating a permanent
 * record of everyone who has ever loaded the page.
 */
export async function pruneStaleViewerSessions(olderThanHours = 24): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  const { data } = await admin
    .from("tank_viewer_sessions")
    .delete()
    .lt("last_seen_at", cutoff)
    .select("id");
  return data?.length ?? 0;
}
