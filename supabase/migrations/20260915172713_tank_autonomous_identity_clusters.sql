-- Autonomous archive/live-feed identity discovery.
--
-- These are recurring visual CLUSTERS, not named people. A cluster may be
-- assigned to a consented detection-catalog target later, but an unlabeled
-- cluster must never be rendered as a real person's name. Raw vectors remain
-- service/admin-only and never travel to the public Tank client.

CREATE TABLE IF NOT EXISTS public.tank_identity_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key TEXT NOT NULL UNIQUE,
  detected_class TEXT NOT NULL CHECK (detected_class IN ('person', 'cat', 'dog')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'merged')),
  assigned_target_slug TEXT,
  suggested_target_slug TEXT,
  suggestion_confidence REAL CHECK (suggestion_confidence IS NULL OR suggestion_confidence BETWEEN 0 AND 1),
  centroid JSONB NOT NULL,
  embedding_length INTEGER NOT NULL CHECK (embedding_length > 0),
  sample_count INTEGER NOT NULL DEFAULT 1 CHECK (sample_count > 0),
  model_key TEXT NOT NULL,
  representative_crop_path TEXT,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(centroid) = 'array'),
  CHECK (jsonb_typeof(source_refs) = 'array'),
  CHECK (status <> 'confirmed' OR assigned_target_slug IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS tank_identity_clusters_review_idx
  ON public.tank_identity_clusters (status, detected_class, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS tank_identity_clusters_target_idx
  ON public.tank_identity_clusters (assigned_target_slug, last_seen_at DESC)
  WHERE assigned_target_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tank_identity_archive_cursor (
  source_key TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_size_bytes BIGINT NOT NULL DEFAULT 0,
  source_modified_at TIMESTAMPTZ,
  sampled_frames INTEGER NOT NULL DEFAULT 0,
  accepted_crops INTEGER NOT NULL DEFAULT 0,
  model_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT
);

ALTER TABLE public.tank_identity_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_identity_archive_cursor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage autonomous identity clusters"
  ON public.tank_identity_clusters;
CREATE POLICY "Staff manage autonomous identity clusters"
  ON public.tank_identity_clusters FOR ALL
  USING (
    auth.role() = 'service_role'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'moderator')
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'moderator')
  );

DROP POLICY IF EXISTS "Service role manages identity archive cursor"
  ON public.tank_identity_archive_cursor;
CREATE POLICY "Service role manages identity archive cursor"
  ON public.tank_identity_archive_cursor FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.tank_identity_clusters IS
  'Operator-reviewable recurring person/pet appearance clusters mined from Tank footage. Unconfirmed clusters are anonymous and cannot name public detection boxes.';
COMMENT ON COLUMN public.tank_identity_clusters.source_refs IS
  'Bounded provenance records: archive source key, room/camera, timestamp, detector confidence, and crop quality. Never raw public footage.';

-- Descriptor provenance is mandatory once more than one embedding family is
-- in play. A 512-value face vector and a 512-value body vector have compatible
-- shapes but incompatible meanings and must never be compared.
ALTER TABLE public.tank_appearance_enrolment
  ADD COLUMN IF NOT EXISTS descriptor_kind TEXT NOT NULL DEFAULT 'color-histogram-v1',
  ADD COLUMN IF NOT EXISTS model_key TEXT NOT NULL DEFAULT 'tank-banded-hsv-v1',
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'live-capture'
    CHECK (source_kind IN ('live-capture', 'archive-reviewed', 'reference-image', 'trained-model')),
  ADD COLUMN IF NOT EXISTS source_ref JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tank_appearance_enrolment.descriptor_kind IS
  'Embedding domain. Matching must require the same descriptor_kind and model_key, not merely the same vector length.';

CREATE TABLE IF NOT EXISTS public.tank_identity_reference_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_slug TEXT NOT NULL,
  detected_class TEXT NOT NULL CHECK (detected_class IN ('person', 'cat', 'dog')),
  descriptor_kind TEXT NOT NULL,
  model_key TEXT NOT NULL,
  embedding JSONB NOT NULL CHECK (jsonb_typeof(embedding) = 'array'),
  embedding_length INTEGER NOT NULL CHECK (embedding_length > 0),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  UNIQUE (target_slug, descriptor_kind, model_key, source_sha256)
);

CREATE INDEX IF NOT EXISTS tank_identity_reference_active_idx
  ON public.tank_identity_reference_index (target_slug, detected_class, model_key)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.tank_identity_training_samples (
  sample_id TEXT PRIMARY KEY CHECK (sample_id ~ '^[0-9a-f]{20}$'),
  target_slug TEXT,
  detected_class TEXT NOT NULL CHECK (detected_class IN ('person', 'cat', 'dog')),
  label_status TEXT NOT NULL DEFAULT 'quarantined'
    CHECK (label_status IN ('quarantined', 'confirmed', 'rejected')),
  label_source TEXT NOT NULL
    CHECK (label_source IN ('operator-reviewed-cluster', 'auto-anchor-proposal', 'operator-correction')),
  cluster_key TEXT,
  source_key TEXT NOT NULL,
  room_scope TEXT,
  offset_seconds DOUBLE PRECISION NOT NULL CHECK (offset_seconds >= 0),
  box_xyxy JSONB NOT NULL CHECK (jsonb_typeof(box_xyxy) = 'array' AND jsonb_array_length(box_xyxy) = 4),
  crop_path TEXT NOT NULL,
  detector_confidence REAL CHECK (detector_confidence IS NULL OR detector_confidence BETWEEN 0 AND 1),
  crop_quality REAL CHECK (crop_quality IS NULL OR crop_quality BETWEEN 0 AND 1),
  anchor_score REAL CHECK (anchor_score IS NULL OR anchor_score BETWEEN -1 AND 1),
  identity_margin REAL CHECK (identity_margin IS NULL OR identity_margin BETWEEN 0 AND 2),
  dataset_split TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (dataset_split IN ('unassigned', 'train', 'validation', 'test')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (label_status <> 'confirmed' OR target_slug IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS tank_identity_training_review_idx
  ON public.tank_identity_training_samples (label_status, detected_class, created_at DESC);
CREATE INDEX IF NOT EXISTS tank_identity_training_target_idx
  ON public.tank_identity_training_samples (target_slug, dataset_split)
  WHERE label_status = 'confirmed';

ALTER TABLE public.tank_identity_reference_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_identity_training_samples ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tank_identity_reference_index FROM anon, authenticated;
REVOKE ALL ON public.tank_identity_training_samples FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tank_identity_reference_index TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tank_identity_training_samples TO authenticated, service_role;

CREATE POLICY "Admins manage identity reference index"
  ON public.tank_identity_reference_index FOR ALL TO authenticated
  USING (((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins manage identity training samples"
  ON public.tank_identity_training_samples FOR ALL TO authenticated
  USING (((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK (((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

COMMENT ON TABLE public.tank_identity_reference_index IS
  'Private consented identity embeddings. Raw references are represented by hashes and must never be exposed to the public Tank client.';
COMMENT ON TABLE public.tank_identity_training_samples IS
  'Private archive-crop provenance and review state. Auto-label proposals remain quarantined until explicitly confirmed.';

-- Preserve the seven operator-labeled household profiles in the private
-- identity index without duplicating raw photos. These UUIDs are the stable
-- runtime-seed ids already materialised in tank_appearance_enrolment; the
-- worker consumes the same 40-value descriptor, so the indexed copy cannot
-- drift into an incompatible embedding family.
WITH household_seed (
  id,
  target_slug,
  detected_class,
  source_kind,
  source_sha256
) AS (
  VALUES
    ('b5564661-e73b-56b7-b679-aaeec920586e'::uuid, 'tyler', 'person', 'reference-image', '5077f424f10b103749264fad98765927043103f1ff5858b2d1ac6b2b8a146f7e'),
    ('4f6fc96c-321b-5b92-90c9-26eaced0af10'::uuid, 'malia', 'person', 'reference-image', '7ca525335b2be8682408a9992198a25fcc2a3b831aa94a86b13bbbdf9771e4a1'),
    ('1c30b25a-2b30-5e7b-b069-359f948fd1a3'::uuid, 'joe', 'person', 'reference-image', '7b2cb760076544a9723ac8856fbe2a7fc7307728c824bc2d577681a86bd547b6'),
    ('53f588bb-0924-5643-b41c-46de9f66ed43'::uuid, 'molly', 'dog', 'reference-image', 'ecc98564e9a4d11a1c293f038d89369db6dd2b21a27f597e56baea114f565ea9'),
    ('5632f771-dd8e-5bfb-b107-49b3e34596ff'::uuid, 'olly', 'dog', 'reference-image', '12e0ad9f04c810b71e9dcefc1926eb801d3dd1190155461f68e89d02e8c01ece'),
    ('10576ff1-b894-5e80-833a-92659bbd57a1'::uuid, 'james', 'cat', 'reference-image', 'e596a214f44303c4fe640a91f0cf3c0df96e069f37ea03f7f57c949b54da69f5'),
    ('e3525c32-424e-511f-a2d6-e0f02ee7d455'::uuid, 'kitty', 'cat', 'reference-image', '5fcb8816771cddee25084e596d6616c64a31ca7c666a7180776c4f809eb6a968'),
    ('8658f94d-7442-5c58-80e5-b3b91536ae7f'::uuid, 'olly', 'dog', 'archive-reviewed', '0852f0d3464d08a3d17cb833ddfef0a6f54fc7b3b22459828ad0abd6043b6c75'),
    ('3e950ccc-37dc-5374-8f22-d7f23297b7ad'::uuid, 'olly', 'dog', 'archive-reviewed', 'f97b146a29f0505a085aa81989d98635aa0d0214db01b8d347a24beba20e383f'),
    ('14bcc17f-8791-5af2-bee4-d4e0e310f80d'::uuid, 'olly', 'dog', 'archive-reviewed', 'd2c5d749fbe874772066e3a22355f739253d6f3687a8df5d69b8bb63c8d48f84'),
    ('35e08862-5b26-538c-be6a-28ce3e70c259'::uuid, 'molly', 'dog', 'archive-reviewed', '2a6d7ee814d2ea44fab1a1900612f21aaf92da2ebd0c5cca05f4de005a015010'),
    ('d07cf803-3cc8-5b63-a18c-8433c95d865f'::uuid, 'molly', 'dog', 'archive-reviewed', '06b946ec4602405acf51144faad31ffa49d4c2c7721c8101eac3795d458a68a7'),
    ('58906363-235b-5977-9b12-1fd0afae05b9'::uuid, 'molly', 'dog', 'archive-reviewed', '55dc023bce597a5e473f1dba2b068ad10e87d49892828449bd4b2a9813b544eb'),
    ('e053e9f4-e373-5466-bae3-7e90caa44b3f'::uuid, 'molly', 'dog', 'archive-reviewed', 'edeb88e180b0b6b5b71f7d18d84cff22e3b89791c06f8a8f4fd21fddd6c7e89c'),
    ('2faed604-b790-5ab8-b7b6-8b992efbc4cd'::uuid, 'james', 'cat', 'archive-reviewed', '556828c474d6d67749eefbb998d5323797a5e1d0ad665e5c313d584dc4ff2592'),
    ('6afdef0e-661a-57ba-8838-5dc8b677c3f7'::uuid, 'molly', 'dog', 'archive-reviewed', '0b1b6eed12a70e1ad81a8e6b1df4fdc91467d1f295b6d442be76696a5463410b'),
    ('55300b35-272f-563b-8eb2-256cf2d97e73'::uuid, 'molly', 'dog', 'archive-reviewed', '8d732f342e6df191f5edf233ce72e6a8120b92805d8d425fa3f3e046f41e0fbd')
), updated_runtime_seed AS (
  UPDATE public.tank_appearance_enrolment AS appearance
  SET
    source_kind = seed.source_kind,
    source_ref = jsonb_build_object(
      'seed_id', seed.id,
      'source_sha256', seed.source_sha256,
      'source_kind', seed.source_kind
    )
  FROM household_seed AS seed
  WHERE appearance.id = seed.id
  RETURNING appearance.id
)
INSERT INTO public.tank_identity_reference_index (
  id,
  target_slug,
  detected_class,
  descriptor_kind,
  model_key,
  embedding,
  embedding_length,
  source_sha256,
  status
)
SELECT
  seed.id,
  seed.target_slug,
  seed.detected_class,
  appearance.descriptor_kind,
  appearance.model_key,
  appearance.signature,
  appearance.signature_length,
  seed.source_sha256,
  'active'
FROM household_seed AS seed
JOIN public.tank_appearance_enrolment AS appearance ON appearance.id = seed.id
WHERE appearance.is_active
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.tank_identity_training_summary
WITH (security_invoker = true)
AS
WITH reference_counts AS (
  SELECT target_slug, count(*)::BIGINT AS active_references
  FROM public.tank_identity_reference_index
  WHERE status = 'active'
  GROUP BY target_slug
), sample_counts AS (
  SELECT
    target_slug,
    count(*) FILTER (WHERE label_status = 'confirmed')::BIGINT AS confirmed_samples,
    count(*) FILTER (WHERE label_status = 'quarantined')::BIGINT AS quarantined_samples,
    count(*) FILTER (WHERE label_status = 'rejected')::BIGINT AS rejected_samples
  FROM public.tank_identity_training_samples
  GROUP BY target_slug
)
SELECT
  coalesce(reference_counts.target_slug, sample_counts.target_slug) AS target_slug,
  coalesce(reference_counts.active_references, 0) AS active_references,
  coalesce(sample_counts.confirmed_samples, 0) AS confirmed_samples,
  coalesce(sample_counts.quarantined_samples, 0) AS quarantined_samples,
  coalesce(sample_counts.rejected_samples, 0) AS rejected_samples
FROM reference_counts
FULL OUTER JOIN sample_counts USING (target_slug);

REVOKE ALL ON public.tank_identity_training_summary FROM anon, authenticated;
GRANT SELECT ON public.tank_identity_training_summary TO authenticated, service_role;

COMMENT ON VIEW public.tank_identity_training_summary IS
  'Security-invoker aggregate for the staff console. It exposes counts only and inherits access checks from the private source tables.';
