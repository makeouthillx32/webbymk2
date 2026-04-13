-- ============================================================
-- Migration: services_tables
-- Creates a fully translatable, dashboard-editable service tree
--
-- Structure:
--   service_categories          (formtechnik, fertigung, reparatur)
--     └── service_sub_services  (individual sub-services)
--           └── service_nested_lists   (bullet-list groups)
--                 └── service_nested_list_items (bullet items)
--
-- Translations are stored as JSONB per row:
--   translations: { "en": { "title": "...", ... }, "de": { "title": "...", ... } }
-- ============================================================

-- ── 1. Categories ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_categories (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        UNIQUE NOT NULL,      -- 'formtechnik' | 'fertigung' | 'reparatur'
  image        text,                              -- hero image path
  tags         text[]      NOT NULL DEFAULT '{}',
  position     integer     NOT NULL DEFAULT 0,   -- display order
  is_active    boolean     NOT NULL DEFAULT true,
  translations jsonb       NOT NULL DEFAULT '{}',
  -- translations shape: { "en": { "title": "", "paragraph": "" }, "de": { ... } }
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Sub-services ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_sub_services (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid        NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  path         text,                              -- URL path e.g. '/werkzeugherstellung'
  images       text[]      NOT NULL DEFAULT '{}', -- gallery image paths
  position     integer     NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  translations jsonb       NOT NULL DEFAULT '{}',
  -- translations shape: { "en": { "title": "", "description": "", "paragraph": "", "cta": "" }, "de": { ... } }
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Nested lists (bullet-list groups) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_nested_lists (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_service_id  uuid        NOT NULL REFERENCES service_sub_services(id) ON DELETE CASCADE,
  position        integer     NOT NULL DEFAULT 0,
  translations    jsonb       NOT NULL DEFAULT '{}',
  -- translations shape: { "en": { "title": "" }, "de": { "title": "" } }
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Nested list items (individual bullets) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS service_nested_list_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nested_list_id  uuid        NOT NULL REFERENCES service_nested_lists(id) ON DELETE CASCADE,
  position        integer     NOT NULL DEFAULT 0,
  translations    jsonb       NOT NULL DEFAULT '{}',
  -- translations shape: { "en": { "text": "" }, "de": { "text": "" } }
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_service_categories_slug     ON service_categories(slug);
CREATE INDEX IF NOT EXISTS idx_service_categories_position ON service_categories(position) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sub_services_category       ON service_sub_services(category_id, position);
CREATE INDEX IF NOT EXISTS idx_nested_lists_sub_service    ON service_nested_lists(sub_service_id, position);
CREATE INDEX IF NOT EXISTS idx_nested_list_items_list      ON service_nested_list_items(nested_list_id, position);

-- ── Auto-update updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_service_categories_updated_at
  BEFORE UPDATE ON service_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_service_sub_services_updated_at
  BEFORE UPDATE ON service_sub_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE service_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_sub_services     ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_nested_lists     ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_nested_list_items ENABLE ROW LEVEL SECURITY;

-- Public can read active services (anonymous + authenticated)
CREATE POLICY "public_read_categories"
  ON service_categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "public_read_sub_services"
  ON service_sub_services FOR SELECT
  USING (is_active = true);

CREATE POLICY "public_read_nested_lists"
  ON service_nested_lists FOR SELECT
  USING (true);

CREATE POLICY "public_read_nested_list_items"
  ON service_nested_list_items FOR SELECT
  USING (true);

-- Only authenticated users with 'admin' or 'editor' role can write
CREATE POLICY "admin_write_categories"
  ON service_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "admin_write_sub_services"
  ON service_sub_services FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "admin_write_nested_lists"
  ON service_nested_lists FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "admin_write_nested_list_items"
  ON service_nested_list_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'editor')
    )
  );

-- ── Seed data (migrated from en.ts + de.ts) ───────────────────────────────────

-- ── Category: formtechnik ──────────────────────────────────────────────────

WITH cat AS (
  INSERT INTO service_categories (slug, image, tags, position, translations) VALUES (
    'formtechnik',
    '/images/mold-close.webp',
    ARRAY['Formentechnik'],
    0,
    '{
      "en": { "title": "What I Offer",    "paragraph": "We build your molds with the right tools" },
      "de": { "title": "Formentechnik",   "paragraph": "Wir bauen Ihre Formen mit den richtigen Werkzeugen" }
    }'::jsonb
  ) RETURNING id
),

-- Sub-service 0: Beratung & Design / Web development
ss0 AS (
  INSERT INTO service_sub_services (category_id, path, images, position, translations)
  SELECT id,
    '/Schedule-Me',
    ARRAY[
      '/images/blog/blog-details-01.jpg',
      '/images/blog/blog-details-02.jpg',
      '/images/blog/blog-details-01.jpg',
      '/images/blog/blog-details-02.jpg',
      '/images/blog/blog-details-01.jpg',
      '/images/blog/blog-details-02.jpg'
    ],
    0,
    '{
      "en": {
        "title":       "Web development",
        "description": "Benefit from our extensive experience",
        "paragraph":   "Every mold is unique, influenced by the geometry of the part and the material to be injected. We specialize in multi-component tools and the in-mold process.",
        "cta":         "Contact us to discuss how we can bring your mold concept to life with precision and efficiency."
      },
      "de": {
        "title":       "Beratung & Design",
        "description": "Profitieren Sie von unserer Erfahrung",
        "paragraph":   "Jede Form ist anders, da die Geometrie des Teils und das zu spritzende Material maßgeblichen Einfluss nehmen. Mit stets aktueller CAD/CAM-Software im eigenen Haus entsteht Ihre Form - gut durchdacht, in kurzer Zeit, zum guten Preis.",
        "cta":         "Kontaktieren Sie uns, um zu besprechen, wie wir Ihr Werkzeugkonzept präzise und effizient umsetzen können."
      }
    }'::jsonb
  FROM cat
  RETURNING id
),
-- Nested lists for ss0
nl0_0 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 0,
    '{ "en": { "title": "Expertise Across Multiple Industries:" }, "de": { "title": "Wir haben Erfahrung mit Werkzeugen aus dem Bereich:" } }'::jsonb
  FROM ss0 RETURNING id
),
nl0_1 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 1,
    '{ "en": { "title": "Materials Expertise:" }, "de": { "title": "Materialkompetenz:" } }'::jsonb
  FROM ss0 RETURNING id
),
nl0_2 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 2,
    '{ "en": { "title": "Advanced Software & Technology:" }, "de": { "title": "Moderne Software & Technologie:" } }'::jsonb
  FROM ss0 RETURNING id
),
-- Items for nl0_0
dummy_nl0_0_items AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, pos, trans FROM nl0_0,
  (VALUES
    (0, '{"en":{"text":"Automotive"},                          "de":{"text":"Automobilindustrie"}}'::jsonb),
    (1, '{"en":{"text":"Household Appliances"},                "de":{"text":"Haushaltsgeräte"}}'::jsonb),
    (2, '{"en":{"text":"High-Voltage Insulators"},             "de":{"text":"Hochspannungsisolatoren"}}'::jsonb),
    (3, '{"en":{"text":"Electronic Device Housings"},          "de":{"text":"Gehäuse für elektronische Geräte"}}'::jsonb),
    (4, '{"en":{"text":"Packaging"},                           "de":{"text":"Verpackungen"}}'::jsonb),
    (5, '{"en":{"text":"Medical Articles"},                    "de":{"text":"Medizinische Artikel"}}'::jsonb)
  ) AS v(pos, trans)
  RETURNING id
),
-- Items for nl0_1
dummy_nl0_1_items AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, pos, trans FROM nl0_1,
  (VALUES
    (0, '{"en":{"text":"PE, PP, PC, PVC, Rubber, Silicone"},   "de":{"text":"PE, PP, PC, PVC, Gummi, Silikon"}}'::jsonb)
  ) AS v(pos, trans)
  RETURNING id
),
-- Items for nl0_2
dummy_nl0_2_items AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, pos, trans FROM nl0_2,
  (VALUES
    (0, '{"en":{"text":"SolidWorks, Siemens NX CAD/CAM integration"},          "de":{"text":"SolidWorks, Siemens NX CAD/CAM-Integration"}}'::jsonb),
    (1, '{"en":{"text":"Import formats: STEP, DXF, and more"},                 "de":{"text":"Importformate: STEP, DXF und mehr"}}'::jsonb),
    (2, '{"en":{"text":"Custom CNC milling programs with Siemens NX CAM"},     "de":{"text":"Individuelle CNC-Fräsprogramme mit Siemens NX CAM"}}'::jsonb)
  ) AS v(pos, trans)
  RETURNING id
),

-- Sub-service 1: Werkzeugherstellung / Graphic Design
ss1 AS (
  INSERT INTO service_sub_services (category_id, path, images, position, translations)
  SELECT id,
    '/werkzeugherstellung',
    ARRAY[
      '/images/blog/blog-details-01.jpg',
      '/images/blog/blog-details-02.jpg',
      '/images/blog/blog-details-01.jpg',
      '/images/blog/blog-details-02.jpg',
      '/images/blog/blog-details-01.jpg',
      '/images/blog/blog-details-02.jpg'
    ],
    1,
    '{
      "en": {
        "title":       "Graphic Design and Digital Art",
        "description": "Your design is only the beginning",
        "paragraph":   "Once approved, we move seamlessly to the manufacturing phase. We leverage state-of-the-art equipment to mill, turn, and grind your mold to perfection. Our machines deliver exceptional tolerance down to a few microns, while our custom polishing techniques ensure mirror finishes.",
        "cta":         "Ready to get started? Contact us today for more information on our tool manufacturing services!"
      },
      "de": {
        "title":       "Werkzeugherstellung",
        "description": "Ihr Design ist erst der Anfang",
        "paragraph":   "Sobald die Freigabe erfolgt, gehen wir nahtlos in die Herstellungsphase über. Mit modernster Ausrüstung fräsen, drehen und schleifen wir Ihr Werkzeug bis zur Perfektion.",
        "cta":         "Bereit, loszulegen? Kontaktieren Sie uns noch heute für weitere Informationen."
      }
    }'::jsonb
  FROM cat
  RETURNING id
),
nl1_0 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 0,
    '{ "en": { "title": "Processes Include:" }, "de": { "title": "Prozesse umfassen:" } }'::jsonb
  FROM ss1 RETURNING id
),
nl1_1 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 1,
    '{ "en": { "title": "Everything Under One Roof:" }, "de": { "title": "Alles unter einem Dach:" } }'::jsonb
  FROM ss1 RETURNING id
),
dummy_nl1_0_items AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, pos, trans FROM nl1_0,
  (VALUES
    (0, '{"en":{"text":"3D Milling"},                  "de":{"text":"3D-Fräsen"}}'::jsonb),
    (1, '{"en":{"text":"High-precision turning"},       "de":{"text":"Hochpräzises Drehen"}}'::jsonb),
    (2, '{"en":{"text":"Ultra-fine grinding"},          "de":{"text":"Ultra-feines Schleifen"}}'::jsonb),
    (3, '{"en":{"text":"Specialized polishing"},        "de":{"text":"Spezialisierte Polieren"}}'::jsonb)
  ) AS v(pos, trans)
  RETURNING id
),
dummy_nl1_1_items AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, pos, trans FROM nl1_1,
  (VALUES
    (0, '{"en":{"text":"Tool manufacturing, finishing, and enhancements are all performed in-house, guaranteeing synchronization and cost-effectiveness."},
          "de":{"text":"Werkzeugherstellung, -veredelung und -verbesserungen erfolgen alle intern, was Synchronisation und Kosteneffizienz garantiert"}}'::jsonb)
  ) AS v(pos, trans)
  RETURNING id
),

-- Sub-service 2 (DE only): Abmusterung & Kleinserienproduktion
ss2 AS (
  INSERT INTO service_sub_services (category_id, path, images, position, translations)
  SELECT id,
    '/abmusterung',
    ARRAY[]::text[],
    2,
    '{
      "en": {
        "title":       "Sampling & Small-Series Production",
        "description": "We do not stop at tool production",
        "paragraph":   "Once your tool has been manufactured, we perform comprehensive sampling to ensure functionality, followed by small-series production.",
        "cta":         "Need high-quality sampling and small production runs? Contact our team to learn how we can support your project."
      },
      "de": {
        "title":       "Abmusterung & Kleinserienproduktion",
        "description": "Wir hören nicht bei der Werkzeugproduktion auf",
        "paragraph":   "Sobald Ihr Werkzeug hergestellt wurde, führen wir eine umfassende Abmusterung durch, um die Funktionalität sicherzustellen, gefolgt von Kleinserienproduktion.",
        "cta":         "Brauchen Sie hochwertige Probenahme und kleine Produktionsläufe? Kontaktieren Sie unser Team."
      }
    }'::jsonb
  FROM cat
  RETURNING id
),
nl2_0 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 0,
    '{ "en": { "title": "Machine Specifications:" }, "de": { "title": "Maschine Spezifikationen:" } }'::jsonb
  FROM ss2 RETURNING id
),
nl2_1 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 1,
    '{ "en": { "title": "Overmolding & Insert Molding" }, "de": { "title": "Überspritzen und Einlegemolding" } }'::jsonb
  FROM ss2 RETURNING id
),
dummy_nl2_0_items AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, 0,
    '{"en":{"text":"Boy 22 M: 220 kN clamping force, precise small-part production"},
      "de":{"text":"Boy 22 M: 220 kN Schließkraft, präzise Kleinteileproduktion"}}'::jsonb
  FROM nl2_0 RETURNING id
),
dummy_nl2_1_items AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, 0,
    '{"en":{"text":"Ideal for integrating labels or other inserts into the tool."},
      "de":{"text":"Ideal zur Integration von Etiketten oder anderen Einlagen in das Werkzeug."}}'::jsonb
  FROM nl2_1 RETURNING id
)

SELECT 'formtechnik seeded' AS result;

-- ── Category: reparatur (DE-first, has full EN translation too) ───────────────

WITH cat AS (
  INSERT INTO service_categories (slug, image, tags, position, translations) VALUES (
    'reparatur',
    NULL,
    ARRAY[]::text[],
    2,
    '{
      "en": { "title": "Repair & Maintenance",     "paragraph": "Our repair and maintenance services" },
      "de": { "title": "Reparatur",                "paragraph": "Unsere Reparatur- und Wartungsdienste" }
    }'::jsonb
  ) RETURNING id
),

ss0 AS (
  INSERT INTO service_sub_services (category_id, path, images, position, translations)
  SELECT id, '/renovierung', ARRAY[]::text[], 0,
    '{
      "en": { "title": "Renovation",    "description": "Extend the life of your molds",        "paragraph": "We specialize in restoring worn molds and tools to their original condition.",                                                                          "cta": "Interested in renovating your tools? Contact our team." },
      "de": { "title": "Renovierung",   "description": "Verlängern Sie die Lebensdauer Ihrer Formen", "paragraph": "Wir sind darauf spezialisiert, abgenutzte Formen und Werkzeuge in ihren ursprünglichen Zustand zurückzuversetzen.",                             "cta": "Interessiert an der Renovierung Ihrer Werkzeuge? Kontaktieren Sie unser Team." }
    }'::jsonb
  FROM cat RETURNING id
),
nl0 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 0, '{ "en": { "title": "Capabilities:" }, "de": { "title": "Fähigkeiten:" } }'::jsonb
  FROM ss0 RETURNING id
),
dummy0 AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, pos, trans FROM nl0,
  (VALUES
    (0, '{"en":{"text":"Full mold renovation"},                                            "de":{"text":"Vollständige Formenrenovierung"}}'::jsonb),
    (1, '{"en":{"text":"Material restoration through welding and machining"},              "de":{"text":"Materialwiederherstellung durch Schweißen und Bearbeitung"}}'::jsonb)
  ) AS v(pos, trans)
  RETURNING id
),

ss1 AS (
  INSERT INTO service_sub_services (category_id, path, images, position, translations)
  SELECT id, '/überholung', ARRAY[]::text[], 1,
    '{
      "en": { "title": "Overhaul",      "description": "A complete overhaul of your molds",    "paragraph": "A full overhaul involves disassembling, inspecting, and repairing your molds to bring them back to peak condition.",                                  "cta": "Want your molds overhauled? Get in touch for more details." },
      "de": { "title": "Überholung",    "description": "Eine komplette Überholung Ihrer Formen", "paragraph": "Eine vollständige Überholung beinhaltet das Zerlegen, Inspizieren und Reparieren Ihrer Formen, um sie wieder in Höchstform zu bringen.",            "cta": "Möchten Sie Ihre Formen überholen lassen? Melden Sie sich für weitere Details." }
    }'::jsonb
  FROM cat RETURNING id
),
nl1 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 0, '{ "en": { "title": "Our Process" }, "de": { "title": "Unser Prozess" } }'::jsonb
  FROM ss1 RETURNING id
),
dummy1 AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, pos, trans FROM nl1,
  (VALUES
    (0, '{"en":{"text":"Full mold disassembly"},                                           "de":{"text":"Vollständige Formenzerlegung"}}'::jsonb),
    (1, '{"en":{"text":"Detailed inspection for damage or wear"},                          "de":{"text":"Detaillierte Inspektion auf Schäden oder Verschleiß"}}'::jsonb),
    (2, '{"en":{"text":"Repairs and upgrades as needed"},                                  "de":{"text":"Reparaturen und Upgrades nach Bedarf"}}'::jsonb)
  ) AS v(pos, trans)
  RETURNING id
),

ss2 AS (
  INSERT INTO service_sub_services (category_id, path, images, position, translations)
  SELECT id, '/formenreparatur', ARRAY[]::text[], 2,
    '{
      "en": { "title": "Mold Repair",   "description": "Restore your molds",                   "paragraph": "Our mold repair services handle everything from surface damage to mechanical issues.",                                                                  "cta": "Contact us for fast and reliable mold repair services." },
      "de": { "title": "Formenreparatur","description": "Stellen Sie Ihre Formen wieder her",   "paragraph": "Unsere Formenreparaturdienste behandeln alles von Oberflächenschäden bis hin zu mechanischen Problemen.",                                            "cta": "Kontaktieren Sie uns für schnelle und zuverlässige Formenreparaturdienste." }
    }'::jsonb
  FROM cat RETURNING id
),
nl2 AS (
  INSERT INTO service_nested_lists (sub_service_id, position, translations)
  SELECT id, 0, '{ "en": { "title": "Services include:" }, "de": { "title": "Dienstleistungen umfassen:" } }'::jsonb
  FROM ss2 RETURNING id
),
dummy2 AS (
  INSERT INTO service_nested_list_items (nested_list_id, position, translations)
  SELECT id, pos, trans FROM nl2,
  (VALUES
    (0, '{"en":{"text":"Surface polishing for scratch repair"},                             "de":{"text":"Oberflächenpolieren zur Kratzerreparatur"}}'::jsonb),
    (1, '{"en":{"text":"Laser welding for structural integrity"},                           "de":{"text":"Laserschweißen für strukturelle Integrität"}}'::jsonb),
    (2, '{"en":{"text":"Detailed inspection and testing"},                                  "de":{"text":"Detaillierte Inspektion und Prüfung"}}'::jsonb)
  ) AS v(pos, trans)
  RETURNING id
)

SELECT 'reparatur seeded' AS result;
