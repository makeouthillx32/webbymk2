// src/lib/edge/cache.test.ts
import { describe, it, expect } from "bun:test";
import { buildEdgeCacheHeaders, generateNginxCacheSnippet, CACHE_PROFILES } from "./cache";

describe("Edge Caching & CDN Optimization", () => {
  it("builds private bypass headers for sensitive data", () => {
    const headers = buildEdgeCacheHeaders({ isPrivate: true });
    expect(headers["Cache-Control"]).toContain("no-store");
    expect(headers["X-Unt-Edge-Cache"]).toBe("BYPASS");
  });

  it("builds edge cache headers with stale-while-revalidate", () => {
    const headers = buildEdgeCacheHeaders({
      ...CACHE_PROFILES.DYNAMIC_PUBLIC,
      tags: ["zone:labs", "catalog:peptides"],
    });

    expect(headers["Cache-Control"]).toContain("max-age=60");
    expect(headers["Cache-Control"]).toContain("stale-while-revalidate=300");
    expect(headers["Surrogate-Key"]).toBe("zone:labs catalog:peptides");
  });

  it("generates valid Nginx cache configuration snippet for L0V3", () => {
    const snippet = generateNginxCacheSnippet("labs");
    expect(snippet).toContain("proxy_cache_path");
    expect(snippet).toContain("labs_cache");
    expect(snippet).toContain("proxy_cache_use_stale");
  });
});
