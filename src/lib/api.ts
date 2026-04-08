export type ApiOk<T> = { ok: true; data: T; meta?: any };
export type ApiErr = { ok: false; error: { code: string; message: string; details?: any } };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export class ApiError extends Error {
  code: string;
  details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

type FetchJsonOptions = RequestInit & {
  // Default true: don't cache during dev so you see changes immediately
  noStore?: boolean;
};

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { noStore = true, ...init } = opts;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: noStore ? "no-store" : init.cache,
  });

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError("BAD_JSON", `Invalid JSON from ${url}`);
  }

  if (!res.ok || !json.ok) {
    const err = (json as ApiErr)?.error;
    throw new ApiError(err?.code ?? "REQUEST_FAILED", err?.message ?? `Request failed: ${url}`, err?.details);
  }

  return (json as ApiOk<T>).data;
}
