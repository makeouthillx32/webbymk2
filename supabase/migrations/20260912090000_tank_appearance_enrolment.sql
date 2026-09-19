-- Migration: 20260912090000_tank_appearance_enrolment.sql
-- Description: Per-individual appearance enrolment — the store behind naming a
-- detection box. Until now `referenceImages` sat on every detectionCatalog
-- record and was read by nothing, so the only identity signal in the system was
-- the room a body happened to be standing in. That was removed on 2026-09-12
-- because it is not evidence: this is one house and its members move through
-- all of it, and narrowing by room produced confidently wrong names (two people
-- in "Joe's room" who were Tyler and Malia both resolved to JOE).
--
-- A row here is a captured appearance signature: a banded colour histogram of
-- one person's crop, taken from a real frame. See
-- src/zones/tank/vision/appearance.ts for what the vector is and — more
-- importantly — what it is NOT. It is not a face. It is dominated by clothing
-- and goes stale when someone changes outfit, which is why `captured_at` is
-- exposed rather than hidden: an operator must be able to see that a person's
-- enrolment is from three days ago before trusting a name on screen.

CREATE TABLE IF NOT EXISTS public.tank_appearance_enrolment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Joins to DetectionTargetRecord.slug in
  -- src/zones/tank/server/detectionCatalog.ts. That catalog is code, not a
  -- table, so this is a bare string with no foreign key behind it — the same
  -- shape (and the same hazard) as knownHabitats -> tank_rooms.room_key, where
  -- "the-foyer" vs "foyer" silently stopped Molly ever being named. The
  -- enrolment API validates the slug against the catalog on write so a typo
  -- fails loudly at capture time instead of quietly never matching.
  target_slug TEXT NOT NULL,

  -- The signature itself: a flat array of floats, SIGNATURE_LENGTH long.
  -- Stored as jsonb rather than a vector type on purpose — this is a tiny
  -- hand-rolled descriptor scanned linearly over a handful of enrolled people,
  -- so there is nothing for pgvector to accelerate, and jsonb keeps the door
  -- open to swapping in a real ReID embedding without a type migration.
  signature JSONB NOT NULL,

  -- How long the vector is, denormalised so a signature captured under an older
  -- descriptor layout can be rejected on read instead of silently producing
  -- similarity 0 against everyone (which reads identically to "nobody matched").
  signature_length INTEGER NOT NULL,

  -- Provenance. Which camera and which frame this came from, so a bad enrolment
  -- can be traced to the shot that produced it rather than merely deleted.
  camera_id TEXT,
  room_scope TEXT,
  -- Optional operator-facing thumbnail of the exact crop, in the tank-archives
  -- bucket. Purely so a human can look at what they enrolled.
  crop_url TEXT,
  -- Detector confidence on the box this was cut from. A signature taken from a
  -- 0.51-confidence smudge is worth less than one from a 0.94 box.
  source_confidence REAL,

  -- Free-text, e.g. "grey hoodie, evening". Clothing IS the signal, so naming
  -- the outfit is what makes an enrolment intelligible weeks later.
  note TEXT,

  -- Soft retire rather than delete: turning an enrolment off and watching the
  -- labels change is the fastest way to tell whether it was the one causing a
  -- mis-name, and that is not recoverable from a DELETE.
  is_active BOOLEAN NOT NULL DEFAULT true,

  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The worker's read on every roster refresh: active enrolments, newest first.
CREATE INDEX IF NOT EXISTS tank_appearance_enrolment_active_idx
  ON public.tank_appearance_enrolment (target_slug, captured_at DESC)
  WHERE is_active;

ALTER TABLE public.tank_appearance_enrolment ENABLE ROW LEVEL SECURITY;

-- Admin + service_role ONLY, with no public read policy of any kind.
--
-- This is deliberately stricter than most tank tables. A signature is a
-- descriptor of how a named, real person in a private home looked at a
-- timestamped moment, tied to a camera and a room. Tank is a public livestream
-- and its anon key reaches the browser, so a permissive SELECT here would
-- publish a per-person movement record to every viewer. Nothing on the public
-- surface needs these rows: viewers receive the resolved LABEL on a box, never
-- the vector behind it.
DROP POLICY IF EXISTS "Admins and service role manage appearance enrolment"
  ON public.tank_appearance_enrolment;
CREATE POLICY "Admins and service role manage appearance enrolment"
  ON public.tank_appearance_enrolment FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR auth.role() = 'service_role'
  );

COMMENT ON TABLE public.tank_appearance_enrolment IS
  'Captured appearance signatures used to name a detection box. Banded colour histogram, NOT face recognition — see src/zones/tank/vision/appearance.ts. Admin/service_role only: these rows describe real people in a private home and must never reach the public stream.';

COMMENT ON COLUMN public.tank_appearance_enrolment.signature IS
  'Flat float array, SIGNATURE_LENGTH long, from buildAppearanceSignature(). Dominated by clothing; goes stale on an outfit change.';

COMMENT ON COLUMN public.tank_appearance_enrolment.is_active IS
  'Soft retire. Prefer toggling this over DELETE so a mis-naming enrolment can be switched off and switched back.';
