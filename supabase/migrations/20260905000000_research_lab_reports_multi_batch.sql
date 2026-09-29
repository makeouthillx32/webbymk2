-- supabase/migrations/20260905000000_research_lab_reports_multi_batch.sql
-- Multi-batch and authentic lab report documentation enhancements for research_lab_reports

ALTER TABLE public.research_lab_reports
  ADD COLUMN IF NOT EXISTS paper_image_url text,
  ADD COLUMN IF NOT EXISTS purity_pct numeric(5, 2),
  ADD COLUMN IF NOT EXISTS verification_url text,
  ADD COLUMN IF NOT EXISTS sha256_checksum text,
  ADD COLUMN IF NOT EXISTS raw_telemetry jsonb DEFAULT '{}'::jsonb;

-- Index for fast batch lookup and filtering by purity
CREATE INDEX IF NOT EXISTS idx_research_lab_reports_lot ON public.research_lab_reports (lot_number);
CREATE INDEX IF NOT EXISTS idx_research_lab_reports_purity ON public.research_lab_reports (purity_pct);

COMMENT ON COLUMN public.research_lab_reports.paper_image_url IS 'High-resolution scan or rendered image of authentic laboratory letterhead';
COMMENT ON COLUMN public.research_lab_reports.purity_pct IS 'Headline purity percentage (e.g., 99.42) for instant filtering and sorting';
COMMENT ON COLUMN public.research_lab_reports.verification_url IS 'Direct laboratory verification portal link (e.g. Janoshik / MZ Biolabs)';
COMMENT ON COLUMN public.research_lab_reports.sha256_checksum IS 'Cryptographic hash of the original laboratory PDF';
COMMENT ON COLUMN public.research_lab_reports.raw_telemetry IS 'Detailed instrument parameters, HPLC integration channels, and mass spec ion abundance';
