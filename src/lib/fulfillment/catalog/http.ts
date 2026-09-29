import "server-only";

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function vendorFetchJson<T>(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        const error = new Error(`Vendor API returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
        if (!RETRYABLE.has(response.status) || attempt === attempts) throw error;
        lastError = error;
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Vendor API request failed");
      if (attempt === attempts) break;
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
  }

  throw lastError ?? new Error("Vendor API request failed");
}

export function moneyToCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

export function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function uniqueHttpsUrls(values: unknown[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:") result.add(url.toString());
    } catch {
      // Provider payloads are untrusted; malformed optional media is skipped.
    }
  }
  return [...result];
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let next = 0;
  const count = Math.max(1, Math.min(Math.floor(concurrency), values.length));
  await Promise.all(Array.from({ length: count }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await worker(values[index], index);
    }
  }));
  return results;
}
