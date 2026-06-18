// src/ink/utils/npmProvision.ts
// ─────────────────────────────────────────────────────────────────────────────
// Programmatically create a Granular Access Token on the npm registry.
// Matches the "unaxis latest" token config shown in npmjs.com UI:
//   - Read + write on all packages
//   - Read + write on the @untsystems org
//   - Bypass 2FA (automation use)
//   - 30-day expiry (default)
//
// No app registration needed — uses username + password + 2FA OTP.
//
// Endpoint: POST https://registry.npmjs.org/-/npm/v1/tokens/granular
// Auth:     Basic base64(username:password)
// Header:   npm-otp: <6-digit TOTP>
// ─────────────────────────────────────────────────────────────────────────────

const NPM_REGISTRY = "https://registry.npmjs.org";

export type ProvisionOptions = {
  name?:       string;   // token display name in npmjs UI
  org?:        string;   // org to grant read+write (e.g. "untsystems")
  expiryDays?: number;   // 0 = no expiry; default 30
};

export type ProvisionResult =
  | { ok: true;  token: string }
  | { ok: false; error: string };

export async function provisionNpmToken(
  username: string,
  password: string,
  otp: string,
  opts: ProvisionOptions = {},
): Promise<ProvisionResult> {
  const {
    name       = "unaxis latest",
    org        = "untsystems",
    expiryDays = 30,
  } = opts;

  const basic = Buffer.from(`${username}:${password}`).toString("base64");

  // Expiry: ISO timestamp N days from now, or null for no expiry
  const expiry = expiryDays > 0
    ? new Date(Date.now() + expiryDays * 86_400_000).toISOString()
    : null;

  const body = {
    password,
    // only include tfa code if one was provided
    ...(otp.trim() ? { npm_tfa_code: otp.trim() } : {}),
    token: {
      name,
      // All packages, read+write
      packages: {
        scope:       "all",
        permissions: "read-write",
      },
      // Org access (untsystems)
      orgs: org ? [{ name: org, permissions: "read-write" }] : [],
      // Bypass 2FA for automation/CI use
      bypass_tfa: true,
      // Expiry
      expiry,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${NPM_REGISTRY}/-/npm/v1/tokens/granular`, {
      method:  "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type":  "application/json",
        ...(otp.trim() ? { "npm-otp": otp.trim() } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    // Fallback: try classic automation token if granular endpoint fails
    return provisionClassicToken(username, password, otp);
  }

  // If granular endpoint returns 404/405 (older registry), fall back to classic
  if (res.status === 404 || res.status === 405) {
    return provisionClassicToken(username, password, otp);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Non-JSON response (HTTP ${res.status})` };
  }

  if (!res.ok) {
    const msg = typeof parsed.error === "string"
      ? parsed.error
      : typeof parsed.message === "string"
        ? parsed.message
        : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }

  // Granular token response: { token: "npm_..." }
  const token = parsed.token ?? (parsed as any).value;
  if (typeof token !== "string" || !token) {
    return { ok: false, error: "npm returned no token in response" };
  }

  return { ok: true, token };
}

// ── Fallback: Classic Automation token ───────────────────────────────────────
// Used if the granular endpoint is unavailable. Classic automation tokens
// also bypass 2FA and have read+write on all packages.

async function provisionClassicToken(
  username: string,
  password: string,
  otp: string,
): Promise<ProvisionResult> {
  const basic = Buffer.from(`${username}:${password}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(`${NPM_REGISTRY}/-/npm/v1/tokens`, {
      method:  "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type":  "application/json",
        ...(otp.trim() ? { "npm-otp": otp.trim() } : {}),
      },
      body: JSON.stringify({
        password,
        readonly:   false,
        automation: true,
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${msg}` };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Non-JSON response (HTTP ${res.status})` };
  }

  if (!res.ok) {
    const msg = typeof parsed.error === "string" ? parsed.error : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }

  const token = parsed.token;
  if (typeof token !== "string" || !token) {
    return { ok: false, error: "npm returned no token in response" };
  }

  return { ok: true, token };
}
