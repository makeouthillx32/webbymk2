// src/lib/auth/sessionPolicy.ts
// ─────────────────────────────────────────────────────────────────────────────
// How long a sign-in stays good, per zone.
//
// Every zone shares ONE session cookie (`sb-unenter-auth-token` on
// `.unenter.live`) — that is deliberate and load-bearing: it is what lets a
// researcher sign in on www and still have a cart on labs. One cookie cannot
// carry two different Max-Ages, so per-zone lifetimes cannot be done by
// expiring the cookie.
//
// So the session never expires on its own, and each zone decides how FRESH a
// sign-in has to be before it will accept it. A dashboard wants a real limit —
// an unattended admin tab should not stay privileged for a month. A streaming
// site wants the opposite: recognise me until I clear my cookies, because
// re-authenticating to watch a camera is pure friction.
//
// Consequence worth being explicit about: exceeding a zone's limit does NOT
// sign the user out. It asks them to re-authenticate FOR THAT ZONE. Destroying
// the shared session would mean core's weekly limit silently logging them out
// of Tank too, which is exactly the behaviour this exists to remove.
// ─────────────────────────────────────────────────────────────────────────────

export const HOUR = 60 * 60;
export const DAY = 24 * HOUR;

export type ZoneSessionPolicy = {
  /**
   * Seconds a sign-in stays acceptable for this zone.
   * `null` means never stale — remember the visitor until they clear cookies
   * or sign out.
   */
  maxAgeSeconds: number | null;
  /** Shown to the operator; also why the value is what it is. */
  rationale: string;
};

/**
 * Per-zone defaults. Override any of these at deploy time with
 * `AUTH_SESSION_MAX_AGE_<ZONE>` in seconds, or the literal `never`.
 * `AUTH_SESSION_MAX_AGE_DEFAULT` moves the fallback for unlisted zones.
 */
export const ZONE_SESSION_POLICIES: Record<string, ZoneSessionPolicy> = {
  // The reason this whole module exists. A viewer should be recognised
  // indefinitely; being asked to sign in again to watch a room is the single
  // most irritating thing a streaming site can do.
  //
  // Viewing only. Tank's operator surfaces are carved out below as
  // "tank:backstage" — never logging out a viewer is the goal; never logging
  // out an operator console is a different and much less defensible thing.
  tank: {
    maxAgeSeconds: null,
    rationale: "Streaming: remember the viewer until they clear cookies.",
  },

  // Tank's operator surfaces — /admin, /director-configuration, /director.
  // Viewing is remembered forever; running the house is not. This is the
  // per-route ceiling the tank entry above used to say did not exist: the
  // director console can cut cameras, hold attention and drive PTZ, which is
  // admin work and belongs in the admin tier even though it lives on a zone
  // whose whole point is never logging you out.
  //
  // Keyed as "tank:backstage" and resolved by sessionPolicyKey() in
  // ./backstage.ts, so middleware and this table read the same list.
  // Override with AUTH_SESSION_MAX_AGE_TANK_BACKSTAGE.
  "tank:backstage": {
    maxAgeSeconds: 7 * DAY,
    rationale: "Operator console: cuts, attention and PTZ. Admin tier, not viewer tier.",
  },

  // The dashboard is where role escalation and money live, so a real ceiling
  // belongs here — but a week, not half an hour.
  //
  // Four keys, on purpose. The core zone's actual `name` in multiZone.ts is
  // "unenter"; middleware passes the literal "core" when `isCoreHost` is set;
  // and `dashboard` / `app` are the two zones whose config carries
  // `requiresAuth: true`, which makes them the ones this ceiling is really
  // about. Listing all four beats relying on the default and hoping.
  core: {
    maxAgeSeconds: 7 * DAY,
    rationale: "Dashboard holds admin + billing; a week is the ceiling.",
  },
  unenter: {
    maxAgeSeconds: 7 * DAY,
    rationale: "Core zone (multiZone name for core); same ceiling as core.",
  },
  dashboard: {
    maxAgeSeconds: 7 * DAY,
    rationale: "requiresAuth zone: admin surfaces, role and billing edits.",
  },
  app: {
    maxAgeSeconds: 7 * DAY,
    rationale: "requiresAuth zone: signed-in app surfaces.",
  },

  // Guest checkout works (create-payment-intent mints an `unenter_guest_key`
  // and upserts a guest customer), so a session is never what stands between a
  // customer and a purchase. Signing in only buys convenience: saved
  // addresses, order history. That makes a long session cheap — it keeps
  // checkout fast, which is the point — and the only real downside is a shared
  // machine showing someone else's past orders. A month is the balance.
  shop: {
    maxAgeSeconds: 30 * DAY,
    rationale: "Guest checkout exists; auth is convenience, so favour a fast return.",
  },

  // NOT a storefront like shop, despite looking like one. Labs gates on age-21
  // plus a research-use-only acknowledgement, and unlike shop it REQUIRES a
  // sign-in to check out (/research-checkout redirects to /sign-in; the whole
  // zone sits behind ResearchDisclaimerOverlay). Auth here is a compliance
  // control over who is buying controlled research material, not a convenience
  // — so it belongs in the same tier as the admin surfaces, not with shop.
  //
  // Note the consent cookie (labs_research_disclaimer_accepted_v1) is separate
  // and unaffected by this: re-authenticating does not re-prompt the
  // disclaimer. Tighten with AUTH_SESSION_MAX_AGE_LABS if the compliance
  // posture ever demands it.
  labs: {
    maxAgeSeconds: 7 * DAY,
    rationale: "Compliance surface: age-21 + research-use gate, sign-in required to buy.",
  },

  // Sign-in itself must never be gated on freshness — that is where you go to
  // BECOME fresh, and a limit here would be a redirect loop.
  auth: { maxAgeSeconds: null, rationale: "Sign-in surface: never gate." },

  // Authoring does NOT use a browser session — /api/blog/ingest and its image
  // sibling authenticate with `Authorization: Bearer <BLOG_INGEST_TOKEN>`. So
  // a signed-in blog session grants nothing privileged; it is reader identity
  // only, and this value never gates a publish.
  blog: {
    maxAgeSeconds: 30 * DAY,
    rationale: "Publishing uses a Bearer token, not a session; reader identity only.",
  },

  // No authenticated surface exists here today (the docs zone overlay has no
  // auth calls; /operator is public), so this value is currently inert. Kept
  // moderate rather than "never" precisely BECAUSE it is inert: if docs ever
  // grows a gated page, it should inherit a real ceiling instead of silently
  // inheriting "forever".
  docs: {
    maxAgeSeconds: 30 * DAY,
    rationale: "No auth surface today; moderate so a future gated page is not born immortal.",
  },
};

const DEFAULT_POLICY: ZoneSessionPolicy = {
  maxAgeSeconds: 7 * DAY,
  rationale: "Unlisted zone — inherits the conservative default.",
};

function parseOverride(raw: string | undefined): number | null | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "never" || value === "forever" || value === "0") return null;
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return seconds;
}

export function getZoneSessionPolicy(
  zone: string,
  env: Record<string, string | undefined> = process.env,
): ZoneSessionPolicy {
  const key = (zone || "core").toLowerCase();
  const base = ZONE_SESSION_POLICIES[key] ?? {
    ...DEFAULT_POLICY,
    ...(parseOverride(env.AUTH_SESSION_MAX_AGE_DEFAULT) !== undefined
      ? { maxAgeSeconds: parseOverride(env.AUTH_SESSION_MAX_AGE_DEFAULT) as number | null }
      : {}),
  };

  // Non-alphanumerics -> "_" so both "unenter-pw" and "tank:backstage" produce
  // legal env names (AUTH_SESSION_MAX_AGE_UNENTER_PW / ..._TANK_BACKSTAGE).
  const envKey = `AUTH_SESSION_MAX_AGE_${key.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const override = parseOverride(env[envKey]);
  if (override === undefined) return base;
  return { ...base, maxAgeSeconds: override };
}

export type FreshnessVerdict = {
  /** Whether the zone will accept this sign-in without re-authentication. */
  fresh: boolean;
  /** Seconds since the user actually authenticated, when known. */
  ageSeconds: number | null;
  reason:
    | "no-limit"
    | "within-limit"
    | "expired"
    | "unknown-age"
    | "not-signed-in";
};

/**
 * Is this sign-in recent enough for this zone?
 *
 * FAILS OPEN on a missing or unreadable timestamp (`unknown-age` → fresh).
 * That is deliberate: the timestamp is a UX freshness hint, not the
 * authorization boundary. Every real check — RLS, server-side role lookups —
 * runs regardless. Treating an unreadable hint as "expired" would log out every
 * existing signed-in user the moment this shipped, and would turn any cookie
 * hiccup into a forced re-login, which is the exact complaint this is fixing.
 */
export function evaluateSessionFreshness(input: {
  zone: string;
  signedIn: boolean;
  /** Epoch SECONDS of the last real authentication. */
  authAtSeconds: number | null;
  nowSeconds?: number;
  env?: Record<string, string | undefined>;
}): FreshnessVerdict {
  const { zone, signedIn, authAtSeconds, env } = input;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!signedIn) return { fresh: false, ageSeconds: null, reason: "not-signed-in" };

  const policy = getZoneSessionPolicy(zone, env);
  if (policy.maxAgeSeconds === null) {
    return { fresh: true, ageSeconds: null, reason: "no-limit" };
  }

  if (authAtSeconds === null || !Number.isFinite(authAtSeconds)) {
    return { fresh: true, ageSeconds: null, reason: "unknown-age" };
  }

  // A clock skew or a tampered future timestamp reads as age 0 rather than a
  // negative age; it cannot make a session look older than it is.
  const ageSeconds = Math.max(0, now - authAtSeconds);
  return ageSeconds <= policy.maxAgeSeconds
    ? { fresh: true, ageSeconds, reason: "within-limit" }
    : { fresh: false, ageSeconds, reason: "expired" };
}

export function describeZoneSessionPolicy(zone: string, env?: Record<string, string | undefined>): string {
  const policy = getZoneSessionPolicy(zone, env);
  if (policy.maxAgeSeconds === null) return `${zone}: no limit — ${policy.rationale}`;
  const days = policy.maxAgeSeconds / DAY;
  const pretty = days >= 1 ? `${days % 1 === 0 ? days : days.toFixed(1)}d` : `${policy.maxAgeSeconds / HOUR}h`;
  return `${zone}: ${pretty} — ${policy.rationale}`;
}
