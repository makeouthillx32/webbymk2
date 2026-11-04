// src/lib/landing/static-pages.resolve.test.ts
// Pins the 2026-11-03 fix: shop.unenter.live/pages/shipping served Unenter
// Labs' peptide/vial policy because static_pages had no zone. A zone's page
// must resolve to that zone's row or to nothing — never another zone's row.
import { describe, it, expect } from "bun:test";
import {
  fetchPublishedStaticPageForZone,
  type StaticPageRow,
  type StaticPagesClient,
  type StaticPagesQueryBuilder,
} from "./static-pages.resolve";

function row(zone_key: string, slug: string, extra: Partial<StaticPageRow> = {}): StaticPageRow {
  return {
    id: `${zone_key}-${slug}`,
    zone_key,
    slug,
    title: `${zone_key} ${slug}`,
    content: `<p>${zone_key} ${slug}</p>`,
    content_format: "html",
    meta_description: null,
    meta_keywords: null,
    og_image_url: null,
    is_published: true,
    published_at: null,
    version: 1,
    created_at: "2026-11-03T00:00:00Z",
    updated_at: "2026-11-03T00:00:00Z",
    ...extra,
  };
}

/** In-memory stand-in for supabase-js that applies .eq() filters like PostgREST. */
function fakeClient(rows: StaticPageRow[], opts: { ignoreFilters?: boolean } = {}) {
  const calls: Array<Array<[string, unknown]>> = [];
  const client: StaticPagesClient = {
    from() {
      return {
        select() {
          const filters: Array<[string, unknown]> = [];
          calls.push(filters);
          const builder: StaticPagesQueryBuilder = {
            eq(column, value) {
              filters.push([column, value]);
              return builder;
            },
            async maybeSingle() {
              const matches = opts.ignoreFilters
                ? rows
                : rows.filter((r) =>
                    filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v),
                  );
              if (matches.length > 1) {
                return { data: null, error: { message: "multiple rows returned" } };
              }
              return { data: matches[0] ?? null, error: null };
            },
          };
          return builder;
        },
      };
    },
  };
  return { client, calls };
}

const TABLE = [
  row("labs", "shipping", { content: "<p>lyophilized peptide vials ship with a cold pack</p>" }),
  row("labs", "returns"),
  row("labs", "privacy-policy"),
  row("shop", "shipping", { content: "<p>Free shipping on domestic orders over $75</p>" }),
  row("shop", "returns"),
  row("unenter", "shield-privacy-policy"),
];

describe("zone-scoped static page lookup", () => {
  it("shop resolves its own shipping row, labs keeps its own", async () => {
    const { client } = fakeClient(TABLE);
    const shop = await fetchPublishedStaticPageForZone(client, "shop", "shipping");
    const labs = await fetchPublishedStaticPageForZone(client, "labs", "/shipping");
    expect(shop?.zone_key).toBe("shop");
    expect(shop?.content).not.toMatch(/peptide|vial|lyophil/i);
    expect(labs?.zone_key).toBe("labs");
    expect(labs?.content).toMatch(/peptide/);
  });

  it("filters the query by zone_key and slug", async () => {
    const { client, calls } = fakeClient(TABLE);
    await fetchPublishedStaticPageForZone(client, "shop", "returns");
    expect(calls[0]).toContainEqual(["zone_key", "shop"]);
    expect(calls[0]).toContainEqual(["slug", "returns"]);
    expect(calls[0]).toContainEqual(["is_published", true]);
  });

  it("fails closed: a zone without its own row never gets another zone's", async () => {
    const { client } = fakeClient(TABLE);
    // Only labs has privacy-policy; shop/blog/core must not see it.
    for (const zone of ["shop", "blog", "unenter"]) {
      expect(await fetchPublishedStaticPageForZone(client, zone, "privacy-policy")).toBeNull();
    }
    // Only core has shield-privacy-policy.
    expect(await fetchPublishedStaticPageForZone(client, "labs", "shield-privacy-policy")).toBeNull();
  });

  it("discards a returned row that belongs to another zone (defence in depth)", async () => {
    // A client/view that ignores the zone filter and hands back Labs' row.
    const { client } = fakeClient([row("labs", "shipping")], { ignoreFilters: true });
    expect(await fetchPublishedStaticPageForZone(client, "shop", "shipping")).toBeNull();
  });

  it("no zone or no slug → no query, no page", async () => {
    const { client, calls } = fakeClient(TABLE);
    expect(await fetchPublishedStaticPageForZone(client, "", "shipping")).toBeNull();
    expect(await fetchPublishedStaticPageForZone(client, undefined, "shipping")).toBeNull();
    expect(await fetchPublishedStaticPageForZone(client, "shop", "  ")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("unpublished rows are not served", async () => {
    const { client } = fakeClient([row("shop", "draft-page", { is_published: false })], {
      ignoreFilters: true,
    });
    expect(await fetchPublishedStaticPageForZone(client, "shop", "draft-page")).toBeNull();
  });
});
