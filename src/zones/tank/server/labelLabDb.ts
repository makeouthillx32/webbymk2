import { createAdminClient } from "@/utils/supabase/admin";
import { getDetectionCatalog, getTargetBySlug } from "./detectionCatalog";

// The Label Lab is the live half of the Housemate Labels page the operator graded
// the archive with: the same "look at a wall of crops, say who it is" loop, fed by
// the live learner instead of a one-off archive pass. It stays deliberately
// separate from the Identity Review workspace, which grades one track in depth.
//
// Two things it adds over the archive page:
//  * bulk accept — "yes, all 42 confident Molly groups" in one action, because a
//    dog pacing the kitchen produces the same right answer forty times;
//  * guests — an unknown visitor gets their own bucket, named (guest-andy) or
//    numbered (guest-1), so their crops group together and teach the gallery.
//
// It also absorbed the Identity Review workspace (2026-09-18): archive clusters
// and the "is this the same body?" merge lived there, the live queue lived here,
// and two screens grading the same table was one too many.

/** The learner's own verdict on its guess, recorded in the cluster's source_refs. */
export function suggestionIsSure(sourceRefs: unknown): boolean {
  if (!Array.isArray(sourceRefs)) return false;
  for (let index = sourceRefs.length - 1; index >= 0; index -= 1) {
    const entry = sourceRefs[index] as { learner?: { sure?: unknown } } | null;
    if (entry && typeof entry === "object" && entry.learner) return entry.learner.sure === true;
  }
  return false;
}

function vector(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.map(Number);
  return values.every(Number.isFinite) ? values : null;
}

/** Cosine similarity of two stored centroids; null when they cannot be compared. */
export function cosineSimilarity(left: unknown, right: unknown): number | null {
  const a = vector(left);
  const b = vector(right);
  if (!a || !b || a.length !== b.length) return null;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aa += a[index] * a[index];
    bb += b[index] * b[index];
  }
  if (aa === 0 || bb === 0) return null;
  return dot / Math.sqrt(aa * bb);
}

/** Pairs the operator has already said are different people, from source_refs. */
export function dismissedPairs(sourceRefs: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(sourceRefs)) return out;
  for (const entry of sourceRefs) {
    const ref = entry as { reviewPair?: unknown; decision?: unknown } | null;
    if (ref && typeof ref === "object" && typeof ref.reviewPair === "string" && ref.decision === "different") out.add(ref.reviewPair);
  }
  return out;
}

export const LAB_SCOPES = ["all", "live", "archive"] as const;
export type LabScope = (typeof LAB_SCOPES)[number];

export const LAB_KINDS = ["all", "member", "guest", "negative"] as const;
export type LabKind = (typeof LAB_KINDS)[number];

export const LAB_QUEUES = ["confident", "unsure", "skipped", "named", "rejected"] as const;
export type LabQueue = (typeof LAB_QUEUES)[number];
export type LabClass = "person" | "cat" | "dog";

// A guest bucket is either numbered (guest-2, for someone whose name nobody
// knows yet) or named (guest-andy). Named is better: the operator is telling
// the gallery who this is, and "Andy" is what they will look for next week.
const GUEST_SLUG = /^guest-((?:[1-9][0-9]{0,2})|(?:[a-z][a-z0-9-]{0,23}))$/;
// "not-server-rack": a thing the detector mistakes for a person. It is training
// data, not an identity, and it never appears as somebody the director follows.
const NEGATIVE_SLUG = /^not-([a-z][a-z0-9-]{0,23})$/;
const GUEST_NUMBER = /^guest-([1-9][0-9]{0,2})$/;
const TILE_LIMIT = 24;
const RETRICKLE_KEY = "label_lab_retrickle";
/** A job that has said nothing for this long is dead, and may be asked for again. */
const RETRICKLE_STALE_MS = 20 * 60 * 1000;
const GROUP_LIMIT = 60;

export function isGuestSlug(slug: string): boolean {
  return GUEST_SLUG.test(slug);
}

export function isNegativeSlug(slug: string): boolean {
  return NEGATIVE_SLUG.test(slug);
}

/** "Server rack" -> "not-server-rack". Null when the words make no slug. */
export function negativeSlugFromName(name: string): string | null {
  const slug = `not-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  return isNegativeSlug(slug) ? slug : null;
}

export function negativeDisplayName(slug: string): string {
  const match = NEGATIVE_SLUG.exec(slug);
  if (!match) return slug.toUpperCase();
  const words = match[1].split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  return `Not a person · ${words}`;
}

export function guestDisplayName(slug: string): string {
  const numbered = GUEST_NUMBER.exec(slug);
  if (numbered) return `Guest ${numbered[1]}`;
  const match = GUEST_SLUG.exec(slug);
  if (!match) return slug.toUpperCase();
  return match[1].split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

/** "Andy" -> "guest-andy". Returns null for a name that cannot make a slug. */
export function guestSlugFromName(name: string): string | null {
  const slug = `guest-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  return isGuestSlug(slug) ? slug : null;
}

/** The next free guest bucket, given the ones already used. */
export function nextGuestSlug(used: Iterable<string>): string {
  const taken = new Set<number>();
  for (const slug of used) {
    const match = GUEST_NUMBER.exec(slug);
    if (match) taken.add(Number(match[1]));
  }
  let index = 1;
  while (taken.has(index)) index += 1;
  return `guest-${index}`;
}

export function labDisplayName(slug: string | null, fallback: string): string {
  if (!slug) return fallback;
  if (isNegativeSlug(slug)) return negativeDisplayName(slug);
  if (isGuestSlug(slug)) return guestDisplayName(slug);
  return getTargetBySlug(slug)?.displayName ?? slug.toUpperCase();
}

/** Written by the learner's retrickle_singles.py; read by the screen. */
export type RetrickleState = {
  status: "requested" | "running" | "done" | "failed";
  stage?: string;
  startedAt?: string;
  finishedAt?: string;
  result?: { singles: number; groups: number; sure: number; unsure: number };
  error?: string;
  updatedAt?: string;
};

export type LabCandidate = { key: string; displayName: string; slug: string | null; score: number; preview: string | null };
export type LabTile = {
  id: string;
  url: string;
  rejected: boolean;
  /** Set when this one crop was given to somebody other than the group. */
  slug: string | null;
  /** A group's stand-in picture, not a crop: nothing to strike or reassign. */
  preview?: boolean;
  room: string | null;
  at: number;
};
export type LabGroup = {
  key: string;
  cls: LabClass;
  queue: LabQueue;
  guess: string | null;
  guessName: string | null;
  sure: boolean;
  confidence: number | null;
  name: string | null;
  displayName: string;
  rooms: string[];
  seconds: number;
  tileCount: number;
  tiles: LabTile[];
  firstSeen: string | null;
  lastSeen: string | null;
};
export type LabPayload = {
  groups: LabGroup[];
  counts: Record<LabQueue, number>;
  /** Confident groups per guessed name: what a bulk accept would confirm. */
  bulk: Array<{ slug: string; displayName: string; cls: LabClass; groups: number; crops: number }>;
  targets: Array<{ slug: string; displayName: string; cls: LabClass; guest: boolean; negative?: boolean }>;
  /** The bucket a new visitor would get, so "a guest" is always one tap. */
  nextGuest: string;
  /** Only when a group was asked about: who else might be the same body. */
  candidates: LabCandidate[];
  /** Crops struck out across the groups on screen, for the un-strike button. */
  excludedHere: number;
  /** Struck crops sitting in rejected groups: what a purge would destroy. */
  struckInRejected: number;
  /** Rejected groups with no crops at all -- only a preview picture. */
  emptyRejected: number;
  /** Single-image cards waiting in Not sure, and the last re-trickle job. */
  singles: number;
  retrickle: RetrickleState | null;
  learner: { active: boolean; groupsToday: number };
};

type ClusterRow = {
  cluster_key: string;
  detected_class: LabClass;
  status: "pending" | "confirmed" | "rejected" | "merged";
  assigned_target_slug: string | null;
  suggested_target_slug: string | null;
  suggestion_confidence: number | null;
  sample_count: number;
  source_refs: unknown;
  review_deferred_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  /** Archive groups have no live crops of their own; this is their one picture. */
  representative_crop_path: string | null;
};
type SampleRow = {
  sample_id: string;
  cluster_key: string | null;
  label_status: "quarantined" | "confirmed" | "rejected";
  target_slug: string | null;
  room_scope: string | null;
  offset_seconds: number;
};

export function queueOf(cluster: { status: string; assigned_target_slug: string | null; review_deferred_at: string | null; source_refs: unknown }): LabQueue {
  if (cluster.status === "rejected" || cluster.status === "merged") return "rejected";
  if (cluster.status === "confirmed" && cluster.assigned_target_slug) return "named";
  if (cluster.review_deferred_at) return "skipped";
  return suggestionIsSure(cluster.source_refs) ? "confident" : "unsure";
}

function trackSeconds(refs: unknown): number {
  if (!Array.isArray(refs)) return 0;
  return refs.reduce((total: number, entry: unknown) => {
    const ref = entry as { start?: number; end?: number } | null;
    return ref && typeof ref?.start === "number" && typeof ref?.end === "number" ? total + Math.max(0, ref.end - ref.start) : total;
  }, 0);
}

const MEMBER_TARGETS = getDetectionCatalog()
  .filter((target) => target.category === "house_member" || target.category === "pet_animal" || target.category === "guest")
  .flatMap((target) => {
    const cls = target.yoloClassIds.find((value) => value === "person" || value === "cat" || value === "dog") as LabClass | undefined;
    return cls ? [{ slug: target.slug, displayName: target.displayName, cls, guest: target.category === "guest", negative: false }] : [];
  });

export type LabFilter = { queue?: LabQueue; cls?: LabClass; scope?: LabScope; kind?: LabKind; who?: string };

/**
 * Does a group belong in the operator's current view? One function, used by the
 * list AND by every bulk action, so a button that says "everything you are
 * looking at" can never act on a different set than the one on screen.
 */
export function matchesLabFilter(
  cluster: { cluster_key: string; detected_class: string; assigned_target_slug: string | null; suggested_target_slug: string | null },
  queue: LabQueue,
  filter: LabFilter,
): boolean {
  const scope = filter.scope ?? "all";
  if (scope !== "all" && (scope === "live") !== cluster.cluster_key.startsWith("live-")) return false;
  if (filter.queue && queue !== filter.queue) return false;
  if (filter.cls && cluster.detected_class !== filter.cls) return false;
  // A group's "who" is the name it has, or the name it is being offered.
  const slug = cluster.assigned_target_slug ?? cluster.suggested_target_slug;
  // One person at a time: "show me every group that says Tyler" is how a
  // mistake gets found, and it is the filter the operator asked for first.
  if (filter.who) return slug === filter.who;
  const kind = filter.kind ?? "all";
  if (kind === "all") return true;
  if (!slug) return false;
  if (kind === "negative") return isNegativeSlug(slug);
  if (kind === "guest") return isGuestSlug(slug);
  return !isGuestSlug(slug) && !isNegativeSlug(slug);
}

/** Which of these groups still hold at least one crop row. Batched: an IN of
 *  every rejected group is the 414 this lab already hit once. */
async function clustersWithCrops(keys: string[]): Promise<Set<string>> {
  const admin = createAdminClient();
  const found = new Set<string>();
  for (let at = 0; at < keys.length; at += 100) {
    const { data, error } = await admin
      .from("tank_identity_training_samples")
      .select("cluster_key")
      .in("cluster_key", keys.slice(at, at + 100))
      .limit(20000);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (row.cluster_key) found.add(row.cluster_key);
  }
  return found;
}

export async function listLabelLab(
  options: LabFilter & { limit?: number; similarFor?: string; focus?: string } = {},
): Promise<LabPayload> {
  const admin = createAdminClient();
  const scope = options.scope ?? "all";
  const { data: clusterData, error: clusterError } = await ((admin
      .from("tank_identity_clusters")
      .select("cluster_key, detected_class, status, assigned_target_slug, suggested_target_slug, suggestion_confidence, sample_count, source_refs, review_deferred_at, first_seen_at, last_seen_at, representative_crop_path")
      .order("last_seen_at", { ascending: false })
      .limit(2000)));
  if (clusterError) throw new Error(`Label lab clusters failed: ${clusterError.message}`);

  const clusters = (clusterData ?? []) as ClusterRow[];
  const byCluster = new Map<string, SampleRow[]>();

  const counts: Record<LabQueue, number> = { confident: 0, unsure: 0, skipped: 0, named: 0, rejected: 0 };
  const bulk = new Map<string, { slug: string; cls: LabClass; groups: number; crops: number }>();
  const guests = new Set<string>();
  const negatives = new Set<string>();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  let groupsToday = 0;

  const all = clusters.map((cluster) => {
    const queue = queueOf(cluster);
    if (scope === "all" || (scope === "live") === cluster.cluster_key.startsWith("live-")) counts[queue] += 1;
    if (cluster.assigned_target_slug && isGuestSlug(cluster.assigned_target_slug)) guests.add(cluster.assigned_target_slug);
    // A guest mid-enrollment is only ever suggested, never yet confirmed; they
    // still need to be pickable in the Who filter to review their session.
    if (cluster.suggested_target_slug && isGuestSlug(cluster.suggested_target_slug)) guests.add(cluster.suggested_target_slug);
    if (cluster.assigned_target_slug && isNegativeSlug(cluster.assigned_target_slug)) negatives.add(cluster.assigned_target_slug);
    if (cluster.first_seen_at && new Date(cluster.first_seen_at) >= dayStart) groupsToday += 1;
    if (queue === "confident" && cluster.suggested_target_slug) {
      const entry = bulk.get(cluster.suggested_target_slug) ?? { slug: cluster.suggested_target_slug, cls: cluster.detected_class, groups: 0, crops: 0 };
      entry.groups += 1;
      entry.crops += cluster.sample_count;
      bulk.set(cluster.suggested_target_slug, entry);
    }
    return { cluster, queue };
  });

  // "focus" is a group the operator clicked on the Identity Map: it opens
  // first, whatever the filters say, because the map may show a group the
  // current list would not.
  const focusEntry = options.focus ? all.find((entry) => entry.cluster.cluster_key === options.focus) : undefined;
  const wanted = [
    ...(focusEntry ? [focusEntry] : []),
    ...all.filter((entry) => entry !== focusEntry && matchesLabFilter(entry.cluster, entry.queue, options)),
  ].slice(0, options.limit ?? GROUP_LIMIT);

  // Crops are read for the page of groups being shown, not for the whole
  // house: a flat 20,000-row read was already at 14,412 and would have started
  // silently dropping crops off the end of the newest groups.
  if (wanted.length) {
    const { data: sampleData, error: sampleError } = await admin
      .from("tank_identity_training_samples")
      .select("sample_id, cluster_key, label_status, target_slug, room_scope, offset_seconds")
      .in("cluster_key", wanted.map(({ cluster }) => cluster.cluster_key))
      .order("offset_seconds", { ascending: true })
      .limit(20000);
    if (sampleError) throw new Error(`Label lab crops failed: ${sampleError.message}`);
    for (const sample of (sampleData ?? []) as SampleRow[]) {
      if (!sample.cluster_key) continue;
      const entries = byCluster.get(sample.cluster_key) ?? [];
      entries.push(sample);
      byCluster.set(sample.cluster_key, entries);
    }
  }

  const groups: LabGroup[] = wanted.map(({ cluster, queue }) => {
    const rows = byCluster.get(cluster.cluster_key) ?? [];
    const tiles: LabTile[] = rows.slice(0, TILE_LIMIT).map((row) => ({
      id: row.sample_id,
      url: `/api/tank/appearance/review/crop?sample=${encodeURIComponent(row.sample_id)}`,
      rejected: row.label_status === "rejected",
      // Only an owner that disagrees with the group is worth showing.
      slug: row.target_slug && row.target_slug !== cluster.assigned_target_slug ? row.target_slug : null,
      room: row.room_scope,
      at: Number(row.offset_seconds),
    }));
    if (!tiles.length && cluster.representative_crop_path) {
      tiles.push({ id: cluster.cluster_key, url: `/api/tank/appearance/review/crop?cluster=${encodeURIComponent(cluster.cluster_key)}`, rejected: false, slug: null, room: null, at: 0, preview: true });
    }
    const guess = cluster.assigned_target_slug ? null : cluster.suggested_target_slug;
    return {
      key: cluster.cluster_key,
      cls: cluster.detected_class,
      queue,
      guess,
      guessName: guess ? labDisplayName(guess, guess) : null,
      sure: suggestionIsSure(cluster.source_refs),
      confidence: cluster.suggestion_confidence,
      name: cluster.assigned_target_slug,
      displayName: labDisplayName(cluster.assigned_target_slug, `Unknown ${cluster.detected_class}`),
      rooms: [...new Set(rows.map((row) => row.room_scope).filter((room): room is string => Boolean(room)))],
      seconds: Math.round(trackSeconds(cluster.source_refs)),
      tileCount: Math.max(cluster.sample_count, rows.length),
      tiles,
      firstSeen: cluster.first_seen_at,
      lastSeen: cluster.last_seen_at,
    };
  });

  // Single-image cards and the state of the job that regroups them.
  const singles = clusters.filter((cluster) => cluster.cluster_key.startsWith("single-") && cluster.status === "pending").length;
  const { data: retrickleRow } = await admin
    .from("tank_platform_settings").select("value").eq("key", RETRICKLE_KEY).maybeSingle();
  const retrickle = (retrickleRow?.value as RetrickleState | undefined) ?? null;

  // What a purge in the Rejected queue would destroy, counted before it is offered.
  const rejectedKeys = clusters.filter((cluster) => cluster.status === "rejected").map((cluster) => cluster.cluster_key);
  let struckInRejected = 0;
  let emptyRejected = 0;
  if (rejectedKeys.length) {
    for (let at = 0; at < rejectedKeys.length; at += 100) {
      const { count } = await admin
        .from("tank_identity_training_samples")
        .select("sample_id", { count: "exact", head: true })
        .eq("label_status", "rejected")
        .in("cluster_key", rejectedKeys.slice(at, at + 100));
      struckInRejected += count ?? 0;
    }
    const withCrops = await clustersWithCrops(rejectedKeys);
    emptyRejected = rejectedKeys.filter((key) => !withCrops.has(key)).length;
  }

  // Look-alikes: the centroids never leave the server, only names and scores.
  let candidates: LabCandidate[] = [];
  if (options.similarFor) {
    const subject = clusters.find((cluster) => cluster.cluster_key === options.similarFor);
    if (subject) {
      const { data: vectors } = await admin
        .from("tank_identity_clusters")
        .select("cluster_key, centroid, assigned_target_slug, detected_class, status, representative_crop_path")
        .eq("detected_class", subject.detected_class)
        .not("status", "in", "(rejected,merged)")
        .limit(1200);
      const mine = (vectors ?? []).find((row) => row.cluster_key === subject.cluster_key)?.centroid;
      const dismissed = dismissedPairs(subject.source_refs);
      candidates = (vectors ?? [])
        .filter((row) => row.cluster_key !== subject.cluster_key && !dismissed.has(row.cluster_key))
        .map((row) => ({ row, score: cosineSimilarity(mine, row.centroid) }))
        .filter((entry): entry is { row: (typeof vectors)[number]; score: number } => entry.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(({ row, score }) => ({
          key: row.cluster_key,
          displayName: labDisplayName(row.assigned_target_slug, `Unknown ${row.detected_class}`),
          slug: row.assigned_target_slug,
          score: Math.max(-1, Math.min(1, score)),
          preview: row.representative_crop_path ? `/api/tank/appearance/review/crop?cluster=${encodeURIComponent(row.cluster_key)}` : null,
        }));
    }
  }

  const targets = [
    ...MEMBER_TARGETS.map((target) => ({ ...target })),
    ...[...guests].sort().map((slug) => ({ slug, displayName: guestDisplayName(slug), cls: "person" as LabClass, guest: true, negative: false })),
    ...[...negatives].sort().map((slug) => ({ slug, displayName: negativeDisplayName(slug), cls: "person" as LabClass, guest: false, negative: true })),
  ];
  // "Active" means the learner wrote something in the last few minutes: it only
  // runs while the director is in AI mode, so a quiet gap is expected, not a fault.
  const newest = clusters[0]?.last_seen_at ? new Date(clusters[0].last_seen_at).getTime() : 0;
  return {
    groups,
    counts,
    bulk: [...bulk.values()]
      .map((entry) => ({ ...entry, displayName: labDisplayName(entry.slug, entry.slug) }))
      .sort((a, b) => b.groups - a.groups),
    targets,
    nextGuest: nextGuestSlug(guests),
    candidates,
    excludedHere: groups.reduce((total, group) => total + group.tiles.filter((tile) => tile.rejected).length, 0),
    struckInRejected,
    emptyRejected,
    singles,
    retrickle,
    learner: { active: Date.now() - newest < 10 * 60 * 1000, groupsToday },
  };
}

export type LabAction =
  | { action: "name"; keys: string[]; slug: string }
  | { action: "reject"; keys: string[] }
  | { action: "skip"; keys: string[] }
  | { action: "restore"; keys: string[] }
  | { action: "accept-confident"; slug: string }
  | { action: "strike-crop"; sampleId: string; rejected: boolean }
  | { action: "set-crop"; sampleId: string; rejected: boolean; slug: string | null }
  | { action: "crops"; key: string; mode: "exclude-all" | "include-all" }
  | { action: "purge-struck"; scope: "group" | "rejected-queue"; key?: string }
  | { action: "drop-struck"; filter: LabFilter }
  | { action: "retrickle" }
  | { action: "same-identity"; key: string; candidateKey: string }
  | { action: "different-identity"; key: string; candidateKey: string };

function assertKeys(keys: unknown): string[] {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 200) throw new Error("keys must hold 1-200 group ids");
  // Any group the lab shows can be graded: live sightings, the archive pass,
  // single-image cards and re-trickled groups alike. This used to insist on
  // "live-", a leftover from before the lab absorbed the other sources, and
  // refused every regrouped card the moment the operator tried to name it.
  if (!keys.every((key) => typeof key === "string" && key.length > 0 && key.length <= 200)) throw new Error("invalid group id");
  return keys as string[];
}

/** The Identity Map built by tools/build_identity_map.py, or null before its first run. */
export async function loadIdentityMap(): Promise<unknown> {
  const { data } = await createAdminClient()
    .from("tank_platform_settings").select("value").eq("key", "label_lab_identity_map").maybeSingle();
  return data?.value ?? null;
}

export async function applyLabAction(input: LabAction, reviewerId: string): Promise<{ changed: number }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (input.action === "set-crop") {
    // A crop can belong to somebody other than its group: the housemate who
    // walked through the guest's shot is training data for the housemate.
    if (input.slug && !isGuestSlug(input.slug) && !isNegativeSlug(input.slug)
        && !MEMBER_TARGETS.some((target) => target.slug === input.slug)) {
      throw new Error("Unknown identity.");
    }
    const { error } = await admin
      .from("tank_identity_training_samples")
      .update({
        label_status: input.rejected ? "rejected" : input.slug ? "confirmed" : "quarantined",
        target_slug: input.rejected ? null : input.slug,
        label_source: "operator-correction",
        reviewed_by: reviewerId,
        reviewed_at: now,
      })
      .eq("sample_id", input.sampleId);
    if (error) throw new Error(error.message);
    return { changed: 1 };
  }

  if (input.action === "crops") {
    const exclude = input.mode === "exclude-all";
    const { data: cluster, error: readError } = await admin
      .from("tank_identity_clusters").select("assigned_target_slug, status").eq("cluster_key", input.key).maybeSingle();
    if (readError) throw new Error(readError.message);
    const named = cluster?.status === "confirmed" ? cluster.assigned_target_slug : null;
    const patch = exclude
      ? { label_status: "rejected" as const, target_slug: null }
      // Putting crops back hands them to the group again, named or not.
      : { label_status: named ? ("confirmed" as const) : ("quarantined" as const), target_slug: named };
    const query = admin
      .from("tank_identity_training_samples")
      .update({ ...patch, label_source: "operator-correction", reviewed_by: reviewerId, reviewed_at: now })
      .eq("cluster_key", input.key);
    const { error } = exclude ? await query : await query.eq("label_status", "rejected");
    if (error) throw new Error(error.message);
    return { changed: 1 };
  }

  if (input.action === "strike-crop") {
    const { error } = await admin
      .from("tank_identity_training_samples")
      .update({ label_status: input.rejected ? "rejected" : "quarantined", label_source: "operator-correction", reviewed_by: reviewerId, reviewed_at: now })
      .eq("sample_id", input.sampleId);
    if (error) throw new Error(error.message);
    return { changed: 1 };
  }

  if (input.action === "name" || input.action === "accept-confident") {
    let keys: string[];
    let slug: string;
    if (input.action === "accept-confident") {
      slug = input.slug;
      const { data, error } = await admin
        .from("tank_identity_clusters")
        .select("cluster_key, source_refs")
        .eq("status", "pending")
        .eq("suggested_target_slug", slug)
        .is("assigned_target_slug", null)
        .is("review_deferred_at", null)
        .limit(500);
      if (error) throw new Error(error.message);
      // Only the learner's confident guesses; an unsure one still deserves a look.
      keys = (data ?? []).filter((row) => suggestionIsSure(row.source_refs)).map((row) => row.cluster_key);
      if (!keys.length) return { changed: 0 };
    } else {
      keys = assertKeys(input.keys);
      slug = input.slug;
    }
    if (!isGuestSlug(slug) && !isNegativeSlug(slug) && !MEMBER_TARGETS.some((target) => target.slug === slug)) {
      throw new Error("Unknown identity.");
    }
    // A negative keeps whatever the detector thought it saw: the point is to
    // remember what that mistake looks like, class and all.
    const existing = isNegativeSlug(slug)
      ? (await admin.from("tank_identity_clusters").select("detected_class").in("cluster_key", keys).limit(1)).data?.[0]?.detected_class
      : null;
    const cls = isNegativeSlug(slug)
      ? (existing ?? "person")
      : isGuestSlug(slug) ? "person" : MEMBER_TARGETS.find((target) => target.slug === slug)!.cls;

    // The detector's class is a guess too. A dog it called a person was a
    // detection mistake, and refusing "that is Molly" left the operator with a
    // group they could not fix at all -- so naming it CORRECTS the class
    // instead of rejecting the correction.
    const { error } = await admin
      .from("tank_identity_clusters")
      .update({ status: "confirmed", assigned_target_slug: slug, detected_class: cls, review_deferred_at: null, reviewed_by: reviewerId, reviewed_at: now, updated_at: now })
      .in("cluster_key", keys);
    if (error) throw new Error(error.message);
    const { error: sampleError } = await admin
      .from("tank_identity_training_samples")
      .update({ target_slug: slug, detected_class: cls, label_status: "confirmed", label_source: "operator-correction", reviewed_by: reviewerId, reviewed_at: now })
      .in("cluster_key", keys)
      .neq("label_status", "rejected")
      // A crop handed to somebody else keeps its own owner.
      .is("target_slug", null);
    if (sampleError) throw new Error(sampleError.message);
    return { changed: keys.length };
  }

  if (input.action === "retrickle") {
    // The models live in the learner container, not here: this only raises the
    // request, and the learner runs tools/retrickle_singles.py when it sees it.
    const { data } = await admin.from("tank_platform_settings").select("value").eq("key", RETRICKLE_KEY).maybeSingle();
    const current = data?.value as RetrickleState | undefined;
    const busySince = current?.updatedAt ? Date.parse(current.updatedAt) : 0;
    if ((current?.status === "running" || current?.status === "requested") && Date.now() - busySince < RETRICKLE_STALE_MS) {
      throw new Error("A re-trickle is already running.");
    }
    const { error } = await admin.from("tank_platform_settings").upsert(
      { key: RETRICKLE_KEY, value: { status: "requested", requestedBy: reviewerId, updatedAt: now }, updated_at: now },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { changed: 0 };
  }

  if (input.action === "drop-struck") {
    // A struck crop in a named group is a crop the operator said is NOT that
    // name -- but not what it IS. Rather than lose it, each one becomes its own
    // single-image card in Not sure, beside the archive's single-image groups,
    // to be named on its own. Never from Rejected: those are not sightings.
    const filter = input.filter ?? {};
    if (filter.queue === "rejected") throw new Error("Rejected groups are not re-graded; burn them instead.");

    const { data: clusterData, error: clusterError } = await admin
      .from("tank_identity_clusters")
      .select("cluster_key, detected_class, status, assigned_target_slug, suggested_target_slug, source_refs, review_deferred_at, centroid, embedding_length, model_key")
      .order("last_seen_at", { ascending: false })
      .limit(2000);
    if (clusterError) throw new Error(clusterError.message);
    const parents = new Map(
      (clusterData ?? [])
        .filter((cluster) => {
          const queue = queueOf(cluster);
          return queue !== "rejected" && matchesLabFilter(cluster, queue, filter);
        })
        .map((cluster) => [cluster.cluster_key, cluster]),
    );
    if (!parents.size) return { changed: 0 };

    // Every struck crop, narrowed here: an IN clause naming every group in the
    // view is the 414 the purge already hit once.
    const struck: Array<Record<string, unknown>> = [];
    for (let page = 0; page < 20; page += 1) {
      const { data, error } = await admin
        .from("tank_identity_training_samples")
        .select("*")
        .eq("label_status", "rejected")
        .order("sample_id")
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(error.message);
      const got = data ?? [];
      struck.push(...got.filter((row) => typeof row.cluster_key === "string" && parents.has(row.cluster_key)));
      if (got.length < 1000) break;
    }
    if (!struck.length) return { changed: 0 };

    const nowIso = new Date().toISOString();
    const singles = struck.map((sample) => {
      const parent = parents.get(sample.cluster_key as string)!;
      return {
        cluster_key: `single-${sample.sample_id as string}`,
        detected_class: sample.detected_class,
        status: "pending",
        assigned_target_slug: null,
        // Deliberately no guess: it was struck FROM this name, so offering the
        // name back would be offering the one answer already ruled out.
        suggested_target_slug: null,
        suggestion_confidence: null,
        // The parent's look is the closest thing to this crop's we hold; it is
        // what "Same as…" compares against until the crop is re-embedded.
        centroid: parent.centroid,
        embedding_length: parent.embedding_length,
        model_key: parent.model_key,
        sample_count: 1,
        representative_crop_path: sample.crop_path,
        source_refs: [{ droppedFrom: parent.cluster_key, droppedFromName: parent.assigned_target_slug, droppedAt: nowIso }, { learner: { sure: false } }],
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        updated_at: nowIso,
      };
    });
    for (let at = 0; at < singles.length; at += 200) {
      const { error } = await admin.from("tank_identity_clusters").upsert(singles.slice(at, at + 200), { onConflict: "cluster_key" });
      if (error) throw new Error(`Could not make single-image cards: ${error.message}`);
    }
    // Move each crop into its card, unstruck and unnamed, ready to grade.
    const moved = struck.map((sample) => ({
      ...sample,
      cluster_key: `single-${sample.sample_id as string}`,
      label_status: "quarantined",
      target_slug: null,
      label_source: "operator-correction",
      reviewed_by: reviewerId,
      reviewed_at: nowIso,
    }));
    for (let at = 0; at < moved.length; at += 200) {
      const { error } = await admin.from("tank_identity_training_samples").upsert(moved.slice(at, at + 200), { onConflict: "sample_id" });
      if (error) throw new Error(`Could not move crops: ${error.message}`);
    }
    return { changed: struck.length };
  }

  if (input.action === "purge-struck") {
    // Destroys crops: the row AND the stored picture, with nothing to restore
    // from. Only ever reached from a two-step confirm in the Rejected queue,
    // and only ever for crops the operator has already struck out.
    // PostgREST puts filters in the URL, so a list of a few thousand ids is a
    // 414 rather than a delete. Every filter here stays short, and the work is
    // done in batches.
    let rows: Array<{ sample_id: string; crop_path: string | null; cluster_key: string | null }> = [];
    if (input.scope === "group") {
      if (!input.key) throw new Error("A group is required to purge one group.");
      const { data, error } = await admin
        .from("tank_identity_training_samples")
        .select("sample_id, crop_path, cluster_key")
        .eq("label_status", "rejected")
        .eq("cluster_key", input.key)
        .limit(5000);
      if (error) throw new Error(error.message);
      rows = data ?? [];
    } else {
      const { data: rejected, error: rejectedError } = await admin
        .from("tank_identity_clusters").select("cluster_key").eq("status", "rejected").limit(5000);
      if (rejectedError) throw new Error(rejectedError.message);
      const keys = new Set((rejected ?? []).map((row) => row.cluster_key));
      if (!keys.size) return { changed: 0 };
      // Fetched by status alone and narrowed here: the alternative is an IN
      // clause holding every rejected group, which is the same 414 again.
      for (let page = 0; page < 20; page += 1) {
        const { data, error } = await admin
          .from("tank_identity_training_samples")
          .select("sample_id, crop_path, cluster_key")
          .eq("label_status", "rejected")
          .order("sample_id")
          .range(page * 1000, page * 1000 + 999);
        if (error) throw new Error(error.message);
        const got = data ?? [];
        rows.push(...got.filter((row) => row.cluster_key && keys.has(row.cluster_key)));
        if (got.length < 1000) break;
      }
    }
    // Pictures first: a row without its picture is a dead link the screen can
    // survive, a picture without its row is litter nothing will ever clean up.
    const prefix = "storage://tank-identity-crops/";
    const removePictures = async (paths: Array<string | null | undefined>) => {
      const objects = paths
        .filter((path): path is string => Boolean(path?.startsWith(prefix)))
        .map((path) => path.slice(prefix.length));
      for (let at = 0; at < objects.length; at += 100) {
        const { error } = await admin.storage.from("tank-identity-crops").remove(objects.slice(at, at + 100));
        if (error) throw new Error(`Could not delete crops from storage: ${error.message}`);
      }
    };
    await removePictures(rows.map((row) => row.crop_path));
    const ids = rows.map((row) => row.sample_id);
    for (let at = 0; at < ids.length; at += 200) {
      const { error } = await admin.from("tank_identity_training_samples").delete().in("sample_id", ids.slice(at, at + 200));
      if (error) throw new Error(error.message);
    }

    // A rejected group with nothing left in it is a shell: no crops, a stale
    // count, and a card that cannot be struck because it has nothing to strike.
    // Every such shell goes, not just the ones this burn emptied -- the archive
    // import left groups that never had a crop row, only a preview picture, and
    // "burn" could never reach them.
    const { data: rejectedGroups, error: groupsError } = await admin
      .from("tank_identity_clusters")
      .select("cluster_key, representative_crop_path")
      .eq("status", "rejected")
      .limit(5000);
    if (groupsError) throw new Error(groupsError.message);
    const candidates = (rejectedGroups ?? []).filter((group) => input.scope !== "group" || group.cluster_key === input.key);
    const withCrops = await clustersWithCrops(candidates.map((group) => group.cluster_key));
    const empties = candidates.filter((group) => !withCrops.has(group.cluster_key));
    await removePictures(empties.map((group) => group.representative_crop_path));
    for (let at = 0; at < empties.length; at += 200) {
      const { error } = await admin
        .from("tank_identity_clusters")
        .delete()
        .eq("status", "rejected")
        .in("cluster_key", empties.slice(at, at + 200).map((group) => group.cluster_key));
      if (error) throw new Error(error.message);
    }
    return { changed: ids.length + empties.length };
  }

  if (input.action === "different-identity") {
    // Remembered as a bounded pair, so the same look-alike stops coming back
    // without either identity being changed.
    const { data: cluster, error: readError } = await admin.from("tank_identity_clusters").select("source_refs").eq("cluster_key", input.key).maybeSingle();
    if (readError || !cluster) throw new Error(readError?.message ?? "Group not found.");
    const refs = (Array.isArray(cluster.source_refs) ? cluster.source_refs : []).filter(
      (entry: unknown) => !(typeof entry === "object" && entry !== null && (entry as { reviewPair?: string }).reviewPair === input.candidateKey),
    );
    refs.push({ reviewPair: input.candidateKey, decision: "different", reviewedAt: now });
    const { error } = await admin
      .from("tank_identity_clusters")
      .update({ source_refs: refs.slice(-100), reviewed_by: reviewerId, reviewed_at: now, updated_at: now })
      .eq("cluster_key", input.key);
    if (error) throw new Error(error.message);
    return { changed: 1 };
  }

  if (input.action === "same-identity") {
    const { data: candidate, error: candidateError } = await admin
      .from("tank_identity_clusters").select("assigned_target_slug").eq("cluster_key", input.candidateKey).maybeSingle();
    if (candidateError || !candidate) throw new Error(candidateError?.message ?? "Look-alike not found.");
    // If the look-alike already has a name, this is really "they are both X".
    if (candidate.assigned_target_slug) {
      return applyLabAction({ action: "name", keys: [input.key], slug: candidate.assigned_target_slug }, reviewerId);
    }
    const { error } = await admin
      .from("tank_identity_clusters")
      .update({ status: "merged", merged_into_cluster_key: input.candidateKey, reviewed_by: reviewerId, reviewed_at: now, updated_at: now })
      .eq("cluster_key", input.key);
    if (error) throw new Error(error.message);
    return { changed: 1 };
  }

  const keys = assertKeys(input.keys);
  const patch =
    input.action === "reject"
      ? { status: "rejected", assigned_target_slug: null, review_deferred_at: null }
      : input.action === "skip"
        ? { review_deferred_at: now }
        : { status: "pending", assigned_target_slug: null, review_deferred_at: null };
  const { error } = await admin
    .from("tank_identity_clusters")
    .update({ ...patch, reviewed_by: reviewerId, reviewed_at: now, updated_at: now })
    .in("cluster_key", keys);
  if (error) throw new Error(error.message);

  if (input.action === "reject" || input.action === "restore") {
    const { error: sampleError } = await admin
      .from("tank_identity_training_samples")
      .update({ target_slug: null, label_status: input.action === "reject" ? "rejected" : "quarantined", label_source: "operator-correction", reviewed_by: reviewerId, reviewed_at: now })
      .in("cluster_key", keys);
    if (sampleError) throw new Error(sampleError.message);
  }
  return { changed: keys.length };
}
