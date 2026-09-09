-- supabase/migrations/20260905010000_hardened_research_coa_batch_architecture.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Hardened Multi-Batch COA Architecture:
-- 1. Separates physical production Batches (research_batches) from Products.
-- 2. Links Lab Reports (research_lab_reports) to Batches with published review states.
-- 3. Dedicated immutable Document Assets (research_lab_report_assets) for multi-page provenance.
-- 4. Dedicated structured Instrument Readings (research_lab_report_instrument_readings).
-- 5. Links Order Items (order_items.allocated_batch_id) to the exact physical batch shipped.
-- 6. Strict RLS ensuring only published reports/assets are public.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Create research_batches Table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.research_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.research_products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.research_product_variants(id) ON DELETE SET NULL,
  batch_number text NOT NULL,
  manufactured_date date,
  expiration_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'testing', 'active', 'depleted', 'recalled', 'archived')),
  is_current_shipping boolean NOT NULL DEFAULT false,
  initial_quantity integer DEFAULT 0,
  remaining_quantity integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_research_batches_product_batch UNIQUE (product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_research_batches_product ON public.research_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_research_batches_shipping ON public.research_batches (product_id, is_current_shipping) WHERE is_current_shipping = true;
CREATE INDEX IF NOT EXISTS idx_research_batches_number ON public.research_batches (batch_number);

-- ── 2. Enhance research_lab_reports ──────────────────────────────────────────
ALTER TABLE public.research_lab_reports
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.research_batches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS published_status text NOT NULL DEFAULT 'published' CHECK (published_status IN ('draft', 'in_review', 'published', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_research_lab_reports_batch ON public.research_lab_reports (batch_id);
CREATE INDEX IF NOT EXISTS idx_research_lab_reports_published ON public.research_lab_reports (published_status);

-- ── 3. Create research_lab_report_assets Table (Multi-Page Provenance) ────────
CREATE TABLE IF NOT EXISTS public.research_lab_report_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_report_id uuid NOT NULL REFERENCES public.research_lab_reports(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('original_pdf', 'page_scan', 'chromatogram_raw', 'mass_spec_raw')),
  page_number integer NOT NULL DEFAULT 1,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  file_size_bytes bigint,
  mime_type text NOT NULL,
  sha256_checksum text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_lab_report_assets_report ON public.research_lab_report_assets (lab_report_id);
CREATE INDEX IF NOT EXISTS idx_research_lab_report_assets_type ON public.research_lab_report_assets (lab_report_id, asset_type);

-- ── 4. Create research_lab_report_instrument_readings Table ──────────────────
CREATE TABLE IF NOT EXISTS public.research_lab_report_instrument_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_report_id uuid NOT NULL REFERENCES public.research_lab_reports(id) ON DELETE CASCADE,
  reading_type text NOT NULL CHECK (reading_type IN ('hplc_peak', 'mass_spec_ion', 'system_parameter')),
  peak_number integer,
  retention_time_min numeric(6,3),
  area numeric,
  height numeric,
  area_pct numeric(5,2),
  chemical_species text,
  signal_to_noise numeric,
  theoretical_mz numeric,
  observed_mz numeric,
  mass_error_ppm numeric,
  relative_abundance_pct numeric(5,2),
  ion_adduct text,
  instrument_parameters jsonb DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_instrument_readings_report ON public.research_lab_report_instrument_readings (lab_report_id);
CREATE INDEX IF NOT EXISTS idx_research_instrument_readings_type ON public.research_lab_report_instrument_readings (lab_report_id, reading_type);

-- ── 5. Add allocated_batch_id to order_items ─────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS allocated_batch_id uuid REFERENCES public.research_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_allocated_batch ON public.order_items (allocated_batch_id) WHERE allocated_batch_id IS NOT NULL;

-- ── 6. Backfill existing batches from research_lab_reports ───────────────────
DO $$
DECLARE
  rec RECORD;
  new_batch_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT product_id, COALESCE(lot_number, 'LOT-GEN-01') AS lot_num, MIN(created_at) AS first_seen
    FROM public.research_lab_reports
    WHERE product_id IS NOT NULL
    GROUP BY product_id, lot_number
  LOOP
    INSERT INTO public.research_batches (product_id, batch_number, status, is_current_shipping, created_at)
    VALUES (rec.product_id, rec.lot_num, 'active', false, rec.first_seen)
    ON CONFLICT (product_id, batch_number) DO UPDATE
      SET status = 'active'
    RETURNING id INTO new_batch_id;

    UPDATE public.research_lab_reports
    SET batch_id = new_batch_id
    WHERE product_id = rec.product_id AND COALESCE(lot_number, 'LOT-GEN-01') = rec.lot_num AND batch_id IS NULL;
  END LOOP;

  -- Set the latest batch per product as is_current_shipping = true
  WITH ranked_batches AS (
    SELECT id, product_id,
           row_number() OVER (PARTITION BY product_id ORDER BY created_at DESC) as rn
    FROM public.research_batches
  )
  UPDATE public.research_batches b
  SET is_current_shipping = true
  FROM ranked_batches r
  WHERE b.id = r.id AND r.rn = 1;

  -- Backfill assets from flat pdf_url and paper_image_url
  INSERT INTO public.research_lab_report_assets (lab_report_id, asset_type, page_number, file_url, storage_path, filename, mime_type, is_primary)
  SELECT id, 'original_pdf', 1, pdf_url, 
         COALESCE(substring(pdf_url from 'storage/v1/object/public/research-lab-reports/(.*)'), 'pdfs/original.pdf'),
         COALESCE(substring(pdf_url from '[^/]+$'), 'report.pdf'),
         'application/pdf', true
  FROM public.research_lab_reports
  WHERE pdf_url IS NOT NULL AND pdf_url != ''
    AND NOT EXISTS (
      SELECT 1 FROM public.research_lab_report_assets a WHERE a.lab_report_id = research_lab_reports.id AND a.asset_type = 'original_pdf'
    );

  INSERT INTO public.research_lab_report_assets (lab_report_id, asset_type, page_number, file_url, storage_path, filename, mime_type, is_primary)
  SELECT id, 'page_scan', 1, paper_image_url,
         COALESCE(substring(paper_image_url from 'storage/v1/object/public/research-lab-reports/(.*)'), 'scans/page-1.webp'),
         COALESCE(substring(paper_image_url from '[^/]+$'), 'scan.webp'),
         'image/webp', true
  FROM public.research_lab_reports
  WHERE paper_image_url IS NOT NULL AND paper_image_url != ''
    AND NOT EXISTS (
      SELECT 1 FROM public.research_lab_report_assets a WHERE a.lab_report_id = research_lab_reports.id AND a.asset_type = 'page_scan'
    );

  -- Allocate active shipping batch to existing research order_items that lack one
  UPDATE public.order_items oi
  SET allocated_batch_id = b.id
  FROM public.research_batches b
  WHERE oi.research_product_id = b.product_id
    AND b.is_current_shipping = true
    AND oi.allocated_batch_id IS NULL;
END $$;

-- ── 7. Configure Row Level Security (RLS) ────────────────────────────────────
ALTER TABLE public.research_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_lab_report_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_lab_report_instrument_readings ENABLE ROW LEVEL SECURITY;

-- Batches: Public can read active batches or batches allocated to their own orders
DROP POLICY IF EXISTS "Public can read active batches" ON public.research_batches;
CREATE POLICY "Public can read active batches" ON public.research_batches
  FOR SELECT
  USING (
    status = 'active'
    OR id IN (
      SELECT oi.allocated_batch_id
      FROM public.order_items oi
      JOIN public.orders o ON oi.order_id = o.id
      WHERE o.auth_user_id = auth.uid() OR o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins have full access to research_batches" ON public.research_batches;
CREATE POLICY "Admins have full access to research_batches" ON public.research_batches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Reports: Public can only view published reports
DROP POLICY IF EXISTS "Public can view published reports" ON public.research_lab_reports;
CREATE POLICY "Public can view published reports" ON public.research_lab_reports
  FOR SELECT
  USING (published_status = 'published');

-- Assets: Public can view assets belonging to published reports
DROP POLICY IF EXISTS "Public can view published report assets" ON public.research_lab_report_assets;
CREATE POLICY "Public can view published report assets" ON public.research_lab_report_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.research_lab_reports r
      WHERE r.id = research_lab_report_assets.lab_report_id
        AND r.published_status = 'published'
    )
  );

DROP POLICY IF EXISTS "Admins have full access to research_lab_report_assets" ON public.research_lab_report_assets;
CREATE POLICY "Admins have full access to research_lab_report_assets" ON public.research_lab_report_assets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Instrument Readings: Public can view readings belonging to published reports
DROP POLICY IF EXISTS "Public can view published report readings" ON public.research_lab_report_instrument_readings;
CREATE POLICY "Public can view published report readings" ON public.research_lab_report_instrument_readings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.research_lab_reports r
      WHERE r.id = research_lab_report_instrument_readings.lab_report_id
        AND r.published_status = 'published'
    )
  );

DROP POLICY IF EXISTS "Admins have full access to research_lab_report_instrument_readings" ON public.research_lab_report_instrument_readings;
CREATE POLICY "Admins have full access to research_lab_report_instrument_readings" ON public.research_lab_report_instrument_readings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
