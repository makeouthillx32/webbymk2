-- ============================================================
-- Migration: about_page
-- Migrates /about page content out of hardcoded locale files
-- into Supabase.
--
-- Approach:
--   - Page copy (title / paragraph / description) → homepage_content
--     row with key = 'about_page', json contains translations JSONB
--   - Team members (ImageAccordion) → new team_members table
-- ============================================================

-- ── 1. Seed about page copy into homepage_content ─────────────────────────────

INSERT INTO homepage_content (key, json) VALUES (
  'about_page',
  '{
    "translations": {
      "en": {
        "title":       "About Me",
        "paragraph":   "Im 22 from Socal, attending school at CTU",
        "description": "''Win Through Your Actions, Never Through Argument: Demonstrate your point rather than arguing. Arguing rarely changes anyone''s mind, but people believe what they see. They''re also less likely to be offended.''"
      },
      "de": {
        "title":       "Über Uns",
        "paragraph":   "Formen Werkstatt, wo Innovation auf Präzision trifft.",
        "description": "Im Herzen von Reichelsheim, Odenwald, sind wir darauf spezialisiert, Ihre Ideen in greifbare Ergebnisse zu verwandeln. Unser voll ausgestattetes Werk ermöglicht es uns, ein umfassendes Dienstleistungsangebot von der Formenherstellung bis hin zur hochpräzisen Maschinenbearbeitung anzubieten."
      }
    }
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  json       = EXCLUDED.json,
  updated_at = now();

-- ── 2. team_members table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url    text        NOT NULL,
  position     integer     NOT NULL DEFAULT 0,   -- display order
  tags         text[]      NOT NULL DEFAULT '{}',
  is_active    boolean     NOT NULL DEFAULT true,
  translations jsonb       NOT NULL DEFAULT '{}',
  -- translations shape: { "en": { "name": "", "role": "" }, "de": { "name": "", "role": "" } }
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_position ON team_members(position) WHERE is_active = true;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_team_members"
  ON team_members FOR SELECT
  USING (is_active = true);

CREATE POLICY "admin_write_team_members"
  ON team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'editor')
    )
  );

-- ── 3. Seed team members (from ImageAccordion.tsx) ────────────────────────────

INSERT INTO team_members (image_url, position, tags, translations) VALUES
(
  '/images/testimonials/auth-01.png',
  0,
  ARRAY['Floral', 'Highlands', 'Wildflowers', 'Colorful', 'Resilience'],
  '{"en": {"name": "Unenter",          "role": "Founder"},           "de": {"name": "Unenter",          "role": "Gründer"}}'::jsonb
),
(
  '/images/testimonials/auth-02.png',
  1,
  ARRAY['Twilight', 'Peaks', 'Silhouette', 'Evening Sky', 'Peaceful'],
  '{"en": {"name": "HelloKittygurlxd", "role": "Co-Founder"},        "de": {"name": "HelloKittygurlxd", "role": "Mitgründerin"}}'::jsonb
),
(
  '/images/testimonials/auth-03.png',
  2,
  ARRAY['Rocky', 'Ridges', 'Contrast', 'Adventure', 'Clouds'],
  '{"en": {"name": "James",            "role": "Emotional Support"},  "de": {"name": "James",            "role": "Emotionale Unterstützung"}}'::jsonb
);
