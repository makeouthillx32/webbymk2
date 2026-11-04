-- static_pages: zone scoping
--
-- Until 2026-11-03 static_pages had one row per slug shared by EVERY zone, so
-- shop.unenter.live/pages/shipping and /legal/returns served Unenter Labs'
-- peptide/vial/cold-pack policies while the Shop homepage promised 30-day
-- apparel returns. Each row now belongs to exactly one zone, slugs are unique
-- per zone, and the app resolves (zone_key, slug) — never slug alone. A zone
-- with no row of its own gets a 404, not another zone's page.
--
-- Backfill = the zone each row actually describes / is embedded on
-- (landing_sections.config->>'slug' by page): Labs copy -> labs, the core
-- home's callouts and core-only legal pages -> unenter, Shop's promo -> shop.
-- New rows MUST name a zone (NOT NULL, no default).

ALTER TABLE public.static_pages ADD COLUMN IF NOT EXISTS zone_key text;

UPDATE public.static_pages SET zone_key = 'labs'
WHERE zone_key IS NULL AND slug IN (
  'about', 'faq', 'privacy-policy', 'terms-and-conditions', 'shipping', 'returns',
  'highlight-family', 'labs-coa-transparency', 'labs-excellence-trust',
  'labs-trust-badges', 'our-big-kits', 'research-disclaimer',
  'wholesale-application', 'wholesale-promo'
);

UPDATE public.static_pages SET zone_key = 'shop'
WHERE zone_key IS NULL AND slug IN ('landing-qr-download');

-- Everything else (core home callouts, facebook-data-deletion,
-- shield-privacy-policy, d-c-promo, …) is the core site's.
UPDATE public.static_pages SET zone_key = 'unenter' WHERE zone_key IS NULL;

ALTER TABLE public.static_pages ALTER COLUMN zone_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'static_pages_zone_key_fkey'
      AND conrelid = 'public.static_pages'::regclass
  ) THEN
    ALTER TABLE public.static_pages
      ADD CONSTRAINT static_pages_zone_key_fkey
      FOREIGN KEY (zone_key) REFERENCES public.zones(key) ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE public.static_pages DROP CONSTRAINT IF EXISTS static_pages_slug_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'static_pages_zone_key_slug_key'
      AND conrelid = 'public.static_pages'::regclass
  ) THEN
    ALTER TABLE public.static_pages
      ADD CONSTRAINT static_pages_zone_key_slug_key UNIQUE (zone_key, slug);
  END IF;
END $$;

DROP INDEX IF EXISTS public.static_pages_slug_published_idx;
CREATE INDEX IF NOT EXISTS static_pages_zone_slug_published_idx
  ON public.static_pages (zone_key, slug) WHERE is_published = true;

COMMENT ON COLUMN public.static_pages.zone_key IS
  'Zone (public.zones.key) this page belongs to. Pages resolve by (zone_key, slug); a zone never falls back to another zone''s row.';
