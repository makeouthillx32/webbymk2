-- Human review state for archive-mined identity clusters.
-- Crop bytes stay on the private Tank host; only staff routes can resolve them.

ALTER TABLE public.tank_identity_clusters
  ADD COLUMN IF NOT EXISTS merged_into_cluster_key TEXT,
  ADD COLUMN IF NOT EXISTS review_deferred_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tank_identity_clusters_merge_idx
  ON public.tank_identity_clusters (merged_into_cluster_key)
  WHERE merged_into_cluster_key IS NOT NULL;

COMMENT ON COLUMN public.tank_identity_clusters.merged_into_cluster_key IS
  'Operator-confirmed same-identity link. It references cluster_key logically so archive reimports remain idempotent.';

COMMENT ON COLUMN public.tank_identity_clusters.review_deferred_at IS
  'Operator chose Skip for now. The cluster stays unconfirmed and can be regraded later.';
