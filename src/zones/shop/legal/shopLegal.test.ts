// src/zones/shop/legal/shopLegal.test.ts
// Shop sells boutique apparel. Its shipping/returns copy must never carry
// Unenter Labs' research-compound terms again (2026-11-03 regression), and must
// keep the homepage's promises: free domestic shipping over $75, easy returns
// and exchanges within 30 days.
import { describe, it, expect } from "bun:test";
import { SHOP_LEGAL_PAGES, readShopLegalHtml } from "@/scripts/seed-shop-legal-pages";
import { privacyPolicyHref, shopPolicyHref, termsHref } from "@/lib/legalLinks";

const LABS_TERMS =
  /\blabs?\b|peptide|vials?\b|lyophili[sz]ed|cold[- ]?pack|cold[- ]chain|research(?:[- ]use)?|hplc|\bcoa\b|compound|laborator|reagent|biochemical|sterility|human consumption/i;

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

describe("Shop legal pages", () => {
  for (const page of SHOP_LEGAL_PAGES) {
    it(`${page.slug}: no Labs / research-compound terms`, () => {
      const html = readShopLegalHtml(page.file);
      expect(html).not.toMatch(LABS_TERMS);
      expect(page.title).not.toMatch(LABS_TERMS);
      expect(page.meta_description).not.toMatch(LABS_TERMS);
      expect(html.startsWith("<!--")).toBe(false); // authoring note stripped
    });
  }

  it("shipping keeps the free-shipping-over-$75 promise", () => {
    expect(text(readShopLegalHtml("shipping.html"))).toMatch(/domestic orders over \$75 ship free/i);
  });

  it("returns keeps the 30-day returns and exchanges promise", () => {
    const t = text(readShopLegalHtml("returns.html"));
    expect(t).toMatch(/returns and exchanges on all boutique apparel within 30 days/i);
  });
});

describe("zone policy links", () => {
  it("shop never links to Labs' privacy/terms rows", () => {
    expect(privacyPolicyHref("shop")).toMatch(/^https:\/\/.+\/privacy$/);
    expect(termsHref("shop")).toMatch(/^https:\/\/.+\/terms$/);
    expect(privacyPolicyHref("shop")).not.toContain("/pages/");
  });

  it("core-site links ignore the container's own NEXT_PUBLIC_SITE_URL", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://dev.unenter.live";
    try {
      expect(privacyPolicyHref("shop")).toBe("https://www.unenter.live/privacy");
      expect(termsHref("blog")).toBe("https://www.unenter.live/terms");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  it("labs keeps its own policies, core its /privacy and /terms", () => {
    expect(privacyPolicyHref("labs")).toBe("/pages/privacy-policy");
    expect(termsHref("labs")).toBe("/pages/terms-and-conditions");
    expect(privacyPolicyHref("unenter")).toBe("/privacy");
    expect(termsHref(undefined)).toBe("/terms");
  });

  it("shipping/returns links point at the shop zone's own pages", () => {
    expect(shopPolicyHref("shipping", "shop")).toBe("/pages/shipping");
    expect(shopPolicyHref("returns", "unenter")).toBe("https://shop.unenter.live/pages/returns");
  });
});
