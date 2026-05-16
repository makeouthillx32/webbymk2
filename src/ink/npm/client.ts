// src/ink/npm/client.ts
// Core HTTP layer — authenticated fetch with timeout + abort.
// All other modules route their requests through here.

import { NPM_HOST } from "../../config/stack.ts";

// Fast operations: auth, list, delete, enable/disable.
export const TIMEOUT_MS      = 6_000;

// Slow operations: create proxy host with certificate_id "new" triggers
// a Let's Encrypt HTTP-01 challenge on the NPM side (30-60s cold).
export const SLOW_TIMEOUT_MS = 90_000;

export async function npmFetch(
  path:      string,
  init:      RequestInit = {},
  token?:    string,
  timeoutMs: number = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${NPM_HOST.apiUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
