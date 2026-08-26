// lib/posteio/client.ts
// REST client for the poste.io admin API running at mail.unenter.live
// (container `poste` on L0V3). Confirmed API shape from poste.io's own
// maintainer (analogic) — https://gist.github.com/analogic/8fcdc87ce8d4d8adfed9:
//   Base: https://<host>/admin/api/v1/
//   Auth: HTTP Basic, using a poste.io ADMIN login (not a regular mailbox)
//   Resources: domains (+ /dkim), boxes
//
// Server-only. POSTEIO_ADMIN_USER/POSTEIO_ADMIN_PASS must never reach the
// browser — every caller in this app goes through admin-gated API routes.

const BASE_URL = (process.env.POSTEIO_API_URL || "https://mail.unenter.live/admin/api/v1").replace(/\/+$/, "");

export class PosteioError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "PosteioError";
  }
}

function authHeader() {
  const user = process.env.POSTEIO_ADMIN_USER;
  const pass = process.env.POSTEIO_ADMIN_PASS;
  if (!user || !pass) {
    throw new PosteioError(500, "POSTEIO_ADMIN_USER / POSTEIO_ADMIN_PASS are not set in .env");
  }
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function request<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
  path: string,
  body?: Record<string, unknown>
): Promise<T | null> {
  const res = await fetch(`${BASE_URL}/${path.replace(/^\/+/, "")}`, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PosteioError(res.status, text || `poste.io API returned ${res.status}`);
  }

  if (res.status === 204) return null;

  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// poste.io's LIST endpoints (GET /domains, GET /boxes) don't return a bare
// array — they wrap it in pagination metadata:
//   { page, paging, last_page, results_count, results: [...] }
// Found 2026-08-08: BoxesPanel.tsx's `.map()` was crashing the whole
// /dashboard/[id]/settings/mail page (TypeError: e.map is not a function)
// because listBoxes()/listDomains() were typed and returned as if the raw
// response WAS the array. This unwraps it once, here, so every caller keeps
// getting the plain array it always expected.
type PosteioListResponse<T> = { results?: T[]; [key: string]: unknown };

async function requestList<T = unknown>(path: string): Promise<T[]> {
  const raw = await request<PosteioListResponse<T> | T[]>("GET", path);
  if (Array.isArray(raw)) return raw; // already a bare array — some poste.io versions do this
  return raw?.results ?? [];
}

// ── Domains ─────────────────────────────────────────────────────────────
export type PosteioDomain = { name: string; [key: string]: unknown };

export const posteio = {
  listDomains: () => requestList<PosteioDomain>("domains"),
  createDomain: (name: string) => request<PosteioDomain>("POST", "domains", { name }),
  deleteDomain: (name: string) => request("DELETE", `domains/${encodeURIComponent(name)}`),

  getDomainDkim: (name: string) =>
    request<{ selector: string; public: string }>("GET", `domains/${encodeURIComponent(name)}/dkim`),
  generateDomainDkim: (name: string) =>
    request<{ selector: string; public: string }>("PUT", `domains/${encodeURIComponent(name)}/dkim`),

  // ── Mailboxes ────────────────────────────────────────────────────────
  // poste.io's box objects key on `address`, not `email` — normalized here
  // so BoxesPanel.tsx's existing `{ email, name, disabled }` shape keeps working.
  listBoxes: async (): Promise<PosteioBox[]> => {
    const raw = await requestList<PosteioBox & { address?: string }>("boxes");
    return raw.map((b) => ({ ...b, email: b.email ?? b.address ?? "" }));
  },
  getBox: (email: string) => request<PosteioBox>("GET", `boxes/${encodeURIComponent(email)}`),
  createBox: (email: string, passwordPlaintext: string, name?: string) =>
    request<PosteioBox>("POST", "boxes", { email, passwordPlaintext, name }),
  updateBox: (
    email: string,
    patch: { name?: string; disabled?: boolean; passwordPlaintext?: string }
  ) => request<PosteioBox>("PATCH", `boxes/${encodeURIComponent(email)}`, patch),
  deleteBox: (email: string) => request("DELETE", `boxes/${encodeURIComponent(email)}`),
};

export type PosteioBox = {
  email: string;
  name?: string;
  disabled?: boolean;
  [key: string]: unknown;
};
