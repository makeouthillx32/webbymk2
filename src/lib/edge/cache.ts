// src/lib/edge/cache.ts
// ─────────────────────────────────────────────────────────────────────────────
// Edge Caching & CDN optimization primitives for Unenter Edge Platform.
// Configures Nginx proxy_cache and delivers sub-millisecond cache tags.
// ─────────────────────────────────────────────────────────────────────────────

export interface EdgeCacheOptions {
  ttlSeconds?: number;
  staleWhileRevalidateSeconds?: number;
  tags?: string[];
  isPrivate?: boolean;
}

export const CACHE_PROFILES = {
  /** Static assets (JS, CSS, fonts, SVG) - 1 year immutable edge cache */
  STATIC_IMMUTABLE: {
    ttlSeconds: 31_536_000,
    staleWhileRevalidateSeconds: 86_400,
  },
  /** Media & public storage assets (images, soundboard clips, avatars) - 7 days */
  MEDIA_ASSET: {
    ttlSeconds: 604_800,
    staleWhileRevalidateSeconds: 86_400,
  },
  /** Dynamic public data (catalog, blog posts, public profiles) - 60s edge cache with stale-while-revalidate */
  DYNAMIC_PUBLIC: {
    ttlSeconds: 60,
    staleWhileRevalidateSeconds: 300,
  },
} as const;

export function buildEdgeCacheHeaders(options: EdgeCacheOptions = {}): Record<string, string> {
  if (options.isPrivate) {
    return {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "X-Unt-Edge-Cache": "BYPASS",
    };
  }

  const ttl = options.ttlSeconds ?? 60;
  const swr = options.staleWhileRevalidateSeconds ?? 120;

  const headers: Record<string, string> = {
    "Cache-Control": `public, max-age=${ttl}, stale-while-revalidate=${swr}`,
    "X-Unt-Edge-Cache": "ELIGIBLE",
  };

  if (options.tags && options.tags.length > 0) {
    headers["Surrogate-Key"] = options.tags.join(" ");
    headers["X-Cache-Tags"] = options.tags.join(",");
  }

  return headers;
}

/**
 * Generates an Nginx proxy_cache configuration snippet suitable for injecting
 * into an NPM proxy host or Nginx reverse proxy on Node L0V3.
 */
export function generateNginxCacheSnippet(zoneName: string, cachePath: string = "/data/nginx/cache"): string {
  const safeZone = zoneName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `# --- Unenter Edge Shield CDN Caching (${safeZone}) ---
proxy_cache_path ${cachePath}/${safeZone} levels=1:2 keys_zone=${safeZone}_cache:10m max_size=2g inactive=7d use_temp_path=off;

proxy_cache ${safeZone}_cache;
proxy_cache_key "$scheme$request_method$host$request_uri";
proxy_cache_valid 200 302 10m;
proxy_cache_valid 404 1m;
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
proxy_cache_background_update on;
proxy_cache_lock on;

# Bypass cache on auth cookies or POST/PUT
proxy_cache_bypass $http_authorization $cookie_sb_access_token;
proxy_no_cache $http_authorization $cookie_sb_access_token;

add_header X-Unt-Cache-Status $upstream_cache_status always;
`;
}
