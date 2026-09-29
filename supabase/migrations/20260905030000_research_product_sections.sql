-- supabase/migrations/20260905030000_research_product_sections.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Hardened Research Product Sections & 3-Tier Layered Inheritance:
-- 1. Explicit form_factor column on research_products with check constraints.
-- 2. research_product_sections with strict check constraints on keys, types, status, and form factors.
-- 3. Partial unique indexes enabling non-destructive conflict handling.
-- 4. Real admin authorization check on RLS (requires admin/editor role in profiles).
-- 5. Server-side stored-XSS trigger rejecting executable scripts/event handlers.
-- 6. Non-destructive seeds set to 'draft' with strictly verified laboratory handling copy.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add Explicit Reviewed Form Factor to research_products ─────────────────
ALTER TABLE public.research_products
  ADD COLUMN IF NOT EXISTS form_factor text;

ALTER TABLE public.research_products
  DROP CONSTRAINT IF EXISTS check_research_products_form_factor;

ALTER TABLE public.research_products
  ADD CONSTRAINT check_research_products_form_factor
  CHECK (form_factor IS NULL OR form_factor IN ('peptides-compounds', 'liquid-solutions', 'capsules', 'sprays', 'lab-supplies'));

-- Reviewed backfill for existing catalog
UPDATE public.research_products
SET form_factor = CASE
  WHEN 'liquid-solutions' = ANY(tags) OR slug LIKE '%liquid%' THEN 'liquid-solutions'
  WHEN 'capsules' = ANY(tags) OR slug LIKE '%capsule%' THEN 'capsules'
  WHEN 'sprays' = ANY(tags) OR slug LIKE '%spray%' THEN 'sprays'
  WHEN 'lab-supplies' = ANY(tags) THEN 'lab-supplies'
  WHEN 'peptides-compounds' = ANY(tags) THEN 'peptides-compounds'
  ELSE NULL
END
WHERE form_factor IS NULL;

-- ── 2. Table: research_product_sections ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.research_product_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.research_products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.research_categories(id) ON DELETE CASCADE,
  form_factor text,
  section_key text NOT NULL,
  section_type text NOT NULL DEFAULT 'rich_text',
  title text,
  eyebrow text,
  html_content text,
  content_json jsonb DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Constraints
ALTER TABLE public.research_product_sections
  DROP CONSTRAINT IF EXISTS check_rps_section_key;
ALTER TABLE public.research_product_sections
  ADD CONSTRAINT check_rps_section_key
  CHECK (section_key IN ('trust_strip', 'overview', 'key_features', 'specifications', 'current_batch', 'previous_batches', 'coa_records', 'handling_storage', 'compliance', 'faq', 'related_products', 'final_disclaimer'));

ALTER TABLE public.research_product_sections
  DROP CONSTRAINT IF EXISTS check_rps_section_type;
ALTER TABLE public.research_product_sections
  ADD CONSTRAINT check_rps_section_type
  CHECK (section_type IN ('rich_text', 'feature_grid', 'specifications', 'faq', 'compliance', 'trust_strip', 'handling_storage', 'key_features', 'disclaimer', 'batch_info', 'coa_records', 'html', 'json', 'mixed'));

ALTER TABLE public.research_product_sections
  DROP CONSTRAINT IF EXISTS check_rps_status;
ALTER TABLE public.research_product_sections
  ADD CONSTRAINT check_rps_status
  CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE public.research_product_sections
  DROP CONSTRAINT IF EXISTS check_rps_form_factor;
ALTER TABLE public.research_product_sections
  ADD CONSTRAINT check_rps_form_factor
  CHECK (form_factor IS NULL OR form_factor IN ('peptides-compounds', 'liquid-solutions', 'capsules', 'sprays', 'lab-supplies'));

-- Partial unique indexes for conflict handling
CREATE UNIQUE INDEX IF NOT EXISTS idx_rps_uniq_product_section
  ON public.research_product_sections (product_id, section_key)
  WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rps_uniq_form_factor_section
  ON public.research_product_sections (form_factor, section_key)
  WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rps_uniq_category_section
  ON public.research_product_sections (category_id, section_key)
  WHERE product_id IS NULL AND category_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rps_uniq_global_section
  ON public.research_product_sections (section_key)
  WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NULL;

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_rps_product_id ON public.research_product_sections(product_id);
CREATE INDEX IF NOT EXISTS idx_rps_category_id ON public.research_product_sections(category_id);
CREATE INDEX IF NOT EXISTS idx_rps_form_factor ON public.research_product_sections(form_factor);
CREATE INDEX IF NOT EXISTS idx_rps_section_key ON public.research_product_sections(section_key);
CREATE INDEX IF NOT EXISTS idx_rps_lookup ON public.research_product_sections(section_key, status, is_enabled);

-- ── 3. Server-Side Stored-XSS Protection Trigger ─────────────────────────────
CREATE OR REPLACE FUNCTION public.check_safe_html_content()
RETURNS trigger AS $$
BEGIN
  IF NEW.html_content IS NOT NULL THEN
    IF NEW.html_content ~* '<script[^>]*>' OR NEW.html_content ~* 'javascript:' OR NEW.html_content ~* 'on[a-z]+\s*=' THEN
      RAISE EXCEPTION 'Security validation failed: html_content contains prohibited executable scripts or event handlers.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_safe_html_content ON public.research_product_sections;
CREATE TRIGGER trg_check_safe_html_content
  BEFORE INSERT OR UPDATE ON public.research_product_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.check_safe_html_content();

-- ── 4. Real Admin Authorization Row Level Security ───────────────────────────
ALTER TABLE public.research_product_sections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Public read: Only published and enabled sections
  DROP POLICY IF EXISTS "Public can view published product sections" ON public.research_product_sections;
  CREATE POLICY "Public can view published product sections"
    ON public.research_product_sections FOR SELECT
    USING (is_enabled = true AND status = 'published');

  -- Drop overly permissive authenticated policy
  DROP POLICY IF EXISTS "Authenticated admins can manage product sections" ON public.research_product_sections;
  DROP POLICY IF EXISTS "Admins can manage product sections" ON public.research_product_sections;

  -- Real admin authorization: Must have admin or editor role in profiles
  CREATE POLICY "Admins can manage product sections"
    ON public.research_product_sections FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'editor')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'editor')
      )
    );

  -- Service role access (for backend tasks and migrations)
  DROP POLICY IF EXISTS "Service role can manage product sections" ON public.research_product_sections;
  CREATE POLICY "Service role can manage product sections"
    ON public.research_product_sections FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
END $$;

-- ── 5. Stored Procedure: 3-Tier Layered Inheritance Resolver ────────────────
CREATE OR REPLACE FUNCTION public.get_product_sections(
  p_product_id uuid,
  p_category_id uuid DEFAULT NULL,
  p_form_factor text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  product_id uuid,
  category_id uuid,
  form_factor text,
  section_key text,
  section_type text,
  title text,
  eyebrow text,
  html_content text,
  content_json jsonb,
  "position" integer,
  is_enabled boolean,
  status text,
  source_level text
)
LANGUAGE sql
STABLE
AS $$
  WITH ranked_sections AS (
    SELECT
      s.*,
      CASE
        WHEN s.product_id IS NOT NULL THEN 1
        WHEN s.category_id IS NOT NULL THEN 2
        WHEN s.form_factor IS NOT NULL THEN 3
        ELSE 4
      END AS priority,
      CASE
        WHEN s.product_id IS NOT NULL THEN 'product_override'
        WHEN s.category_id IS NOT NULL THEN 'category_template'
        WHEN s.form_factor IS NOT NULL THEN 'form_factor_template'
        ELSE 'global_default'
      END AS source_level
    FROM public.research_product_sections s
    WHERE s.is_enabled = true
      AND s.status = 'published'
      AND (
        (s.product_id = p_product_id)
        OR (p_category_id IS NOT NULL AND s.category_id = p_category_id AND s.product_id IS NULL)
        OR (p_form_factor IS NOT NULL AND s.form_factor = p_form_factor AND s.product_id IS NULL AND s.category_id IS NULL)
        OR (s.product_id IS NULL AND s.category_id IS NULL AND s.form_factor IS NULL)
      )
  ),
  distinct_sections AS (
    SELECT DISTINCT ON (section_key)
      r.id,
      r.product_id,
      r.category_id,
      r.form_factor,
      r.section_key,
      r.section_type,
      r.title,
      r.eyebrow,
      r.html_content,
      r.content_json,
      r.position,
      r.is_enabled,
      r.status,
      r.source_level
    FROM ranked_sections r
    ORDER BY r.section_key, r.priority ASC
  )
  SELECT *
  FROM distinct_sections
  ORDER BY "position" ASC;
$$;

-- Ensure any existing sections default to draft for manual review
UPDATE public.research_product_sections SET status = 'draft' WHERE status = 'published';

-- ── 6. Non-Destructive Draft Seeds (Authentic & Truth-Guarded) ───────────────
-- Clean no existing templates. Use ON CONFLICT DO NOTHING. All initial seeds are 'draft'.

-- A. LABS-WIDE DEFAULTS (General baseline, initialized as draft)

INSERT INTO public.research_product_sections (
  section_key, section_type, title, eyebrow, position, content_json, status
) VALUES (
  'trust_strip',
  'trust_strip',
  'Quality Assurance & Verification Standards',
  'Laboratory Rigor',
  10,
  '{
    "items": [
      {
        "icon": "ShieldCheck",
        "title": "Chain-of-Custody Tracking",
        "desc": "Every physical lot is documented from synthesis order to fulfillment."
      },
      {
        "icon": "FileText",
        "title": "Verifiable Public Records",
        "desc": "Digital accession of published chromatography and third-party laboratory reports."
      },
      {
        "icon": "Lock",
        "title": "Research Compliance Gated",
        "desc": "Material release gated strictly for lawful in vitro laboratory investigations."
      },
      {
        "icon": "FlaskConical",
        "title": "Lot Identification",
        "desc": "Discrete lot identifier assigned to released container units."
      }
    ]
  }'::jsonb,
  'draft'
) ON CONFLICT (section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NULL DO NOTHING;

INSERT INTO public.research_product_sections (
  section_key, section_type, title, eyebrow, position, html_content, status
) VALUES (
  'compliance',
  'compliance',
  'Laboratory Compliance & Regulatory Standard',
  'Regulatory Status',
  90,
  '<p>This material is synthesized, purified, and packaged exclusively for <strong>in vitro scientific research and laboratory experimental use</strong>. It is strictly not intended, licensed, or approved for human consumption, clinical application, veterinary use, or therapeutic administration.</p><p>Handling entities warrant appropriate institutional laboratory controls in conformity with OSHA 1910.1450 standard for chemical safety in laboratories.</p>',
  'draft'
) ON CONFLICT (section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NULL DO NOTHING;

INSERT INTO public.research_product_sections (
  section_key, section_type, title, eyebrow, position, html_content, status
) VALUES (
  'final_disclaimer',
  'disclaimer',
  'Notice of Research-Use Restriction',
  'Legal Mandate',
  120,
  '<p><strong>NOTICE TO PURCHASER:</strong> By acquiring this compound, purchasing entities verify that all products are procured strictly for in vitro laboratory experimental evaluations conducted by qualified research personnel. Purchasing entities warrant full possession of appropriate engineering and personal protective equipment. Under no circumstances may this compound be introduced into humans or animals.</p>',
  'draft'
) ON CONFLICT (section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NULL DO NOTHING;

INSERT INTO public.research_product_sections (
  section_key, section_type, title, eyebrow, position, content_json, status
) VALUES (
  'faq',
  'faq',
  'Frequently Asked Technical Questions',
  'Researcher Inquiries',
  100,
  '{
    "questions": [
      {
        "q": "How can I independently confirm analytical certificates for an item?",
        "a": "Every released unit features an assigned lot identifier on the container label and laboratory packing slip. You can enter the lot identifier into our digital verification repository at labs.unenter.live/verify to retrieve verified analytical certificates and instrument data on file."
      },
      {
        "q": "How are research packages prepared for transit?",
        "a": "Compounds are packed in dedicated laboratory packaging designed to preserve container integrity and guard against mechanical transit stress."
      },
      {
        "q": "Are analytical records maintained for each production run?",
        "a": "Yes. Each released synthesis lot receives verified third-party laboratory analysis before release. Our public verification repository archives prior lots for research reproducibility."
      }
    ]
  }'::jsonb,
  'draft'
) ON CONFLICT (section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NULL DO NOTHING;

-- B. FORM FACTOR TEMPLATES (Reviewed, non-clinical, initialized as draft)

-- Peptides & Compounds (Lyophilized)
INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, html_content, content_json, status
) VALUES (
  'peptides-compounds',
  'handling_storage',
  'handling_storage',
  'Lyophilized Compound Storage & Preparation Guidelines',
  'Storage & Preparation',
  80,
  '<p><strong>Solid Storage Conditions:</strong> Maintain sealed vials at <strong>-20°C</strong> in a dry environment protected from light. Equilibrate container to ambient laboratory temperature prior to opening to minimize atmospheric moisture condensation.</p><p><strong>Reconstitution for In Vitro Assays:</strong> Introduce laboratory diluent slowly down the interior glass wall. Swirl gently until dissolution is achieved; avoid violent agitation or vortexing.</p><p><strong>Solution Stability:</strong> Store reconstituted experimental solution at <strong>2°C to 8°C</strong>. For extended assay timelines, prepare single-use aliquots and store frozen at -20°C to minimize freeze-thaw degradation.</p>',
  '{"storage_temp": "-20°C", "protect_from_light": "Yes", "aliquot_recommendation": "Single-Use Aliquots"}'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, content_json, status
) VALUES (
  'peptides-compounds',
  'key_features',
  'feature_grid',
  'Analytical & Structural Attributes',
  'Formulation Attributes',
  30,
  '{
    "features": [
      {
        "title": "Solid Lyophilized Matrix",
        "description": "Supplied as a stable lyophilized cake under controlled laboratory drying conditions."
      },
      {
        "title": "Lot Identification",
        "description": "Assigned discrete lot numbers for reproducible experimental reference."
      },
      {
        "title": "Protective Container",
        "description": "Sealed in borosilicate glass vials with laboratory rubber septa."
      },
      {
        "title": "Identity Verification",
        "description": "Validated against documented theoretical molecular mass and analytical standards."
      }
    ]
  }'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

-- Liquid Solutions
INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, html_content, content_json, status
) VALUES (
  'liquid-solutions',
  'handling_storage',
  'handling_storage',
  'Liquid Formulation Handling & Storage Specifications',
  'Formulation Protocol',
  80,
  '<p><strong>Storage Requirements:</strong> Maintain sealed amber containers at <strong>2°C to 8°C (Refrigerated)</strong> protected from direct ultraviolet light. Do not freeze unless specifically indicated in compound monograph.</p><p><strong>Aliquot Extraction:</strong> Invert bottle gently 2-3 times before pipetting to ensure matrix uniformity. Draw aliquots using calibrated pipettes under aseptic laboratory laminar flow.</p><p><strong>Vial Integrity:</strong> Reseal tightly immediately after aliquot withdrawal to prevent solvent evaporation and atmospheric moisture absorption.</p>',
  '{"storage_temp": "2°C to 8°C (Refrigerated)", "light_sensitivity": "Protect from Light", "container_type": "Amber Glass Bottle"}'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, content_json, status
) VALUES (
  'liquid-solutions',
  'key_features',
  'feature_grid',
  'Liquid Formulation Characteristics',
  'Formulation Attributes',
  30,
  '{
    "features": [
      {
        "title": "Pre-Solubilized Matrix",
        "description": "Homogeneous solution prepared in laboratory-grade solvent matrix."
      },
      {
        "title": "Amber Glass Container",
        "description": "Packaged in UV-filtering amber glass bottles to protect against photolytic degradation."
      },
      {
        "title": "Controlled Concentration",
        "description": "Formulated to precise analytical concentration for direct experimental aliquoting."
      },
      {
        "title": "Lot Traceability",
        "description": "Assigned individual lot numbers matching certificate documentation."
      }
    ]
  }'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

-- Capsules
INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, html_content, content_json, status
) VALUES (
  'capsules',
  'handling_storage',
  'handling_storage',
  'Solid Unit Handling & Environmental Specifications',
  'Storage Parameters',
  80,
  '<p><strong>Storage Conditions:</strong> Store in a cool, dry area at <strong>15°C to 25°C (Controlled Room Temperature)</strong>. Keep container securely capped with desiccant insert intact.</p><p><strong>Environmental Sensitivity:</strong> Protect from high relative humidity (>60% RH) and direct solar radiation to maintain shell integrity and prevent moisture uptake.</p><p><strong>Analytical Use:</strong> For quantitative in vitro assay work, capsule contents may be gravimetrically determined using an analytical microbalance.</p>',
  '{"storage_temp": "15°C to 25°C", "humidity_limit": "<60% RH", "form": "Solid Encapsulated Aliquot"}'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, content_json, status
) VALUES (
  'capsules',
  'key_features',
  'feature_grid',
  'Encapsulated Aliquot Specifications',
  'Formulation Attributes',
  30,
  '{
    "features": [
      {
        "title": "Unit Aliquots",
        "description": "Individually encapsulated quantities for reproducible bench handling."
      },
      {
        "title": "Desiccated Packaging",
        "description": "Container includes laboratory desiccant to prevent atmospheric moisture uptake."
      },
      {
        "title": "Batch Identification",
        "description": "Sealed bottles labeled with traceable lot number and analytical references."
      },
      {
        "title": "Assay Preparation",
        "description": "Formulated for quantitative dispersion into target experimental media."
      }
    ]
  }'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

-- Sprays
INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, html_content, content_json, status
) VALUES (
  'sprays',
  'handling_storage',
  'handling_storage',
  'Dispensing System Handling & Storage Guidance',
  'System Handling',
  80,
  '<p><strong>Storage Conditions:</strong> Store upright at <strong>2°C to 8°C (Refrigerated)</strong>. Keep protective dust cap attached over actuator nozzle when not in use.</p><p><strong>Dispensing Maintenance:</strong> If metering nozzle requires cleaning after experimental dispensing, rinse actuator orifice with sterile deionized water and dry thoroughly under clean nitrogen stream.</p>',
  '{"storage_temp": "2°C to 8°C", "orientation": "Upright", "nozzle_care": "Sterile Rinse Only"}'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, content_json, status
) VALUES (
  'sprays',
  'key_features',
  'feature_grid',
  'Dispensing Mechanism Attributes',
  'Formulation Attributes',
  30,
  '{
    "features": [
      {
        "title": "Metered Actuator",
        "description": "Fitted with calibrated laboratory pump mechanism for consistent volumetric output."
      },
      {
        "title": "Refrigerated Matrix",
        "description": "Formulated in buffered solution optimized for thermal stability under refrigeration."
      },
      {
        "title": "Lot Traceability",
        "description": "Bottle base and secondary carton imprinted with active synthesis lot ID."
      },
      {
        "title": "Nozzle Protection",
        "description": "Equipped with dust-shield cover to prevent particulate contamination."
      }
    ]
  }'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

-- Lab Supplies
INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, html_content, content_json, status
) VALUES (
  'lab-supplies',
  'handling_storage',
  'handling_storage',
  'Laboratory Consumable Handling & Storage Standards',
  'Consumable Standards',
  80,
  '<p><strong>Ambient Storage:</strong> Store unopened supplies at <strong>15°C to 25°C</strong> in clean, dust-free laboratory storage.</p><p><strong>Aseptic Protocol:</strong> Maintain sterile packaging integrity until immediate time of experimental use. Inspect tamper-evident seals before opening.</p>',
  '{"storage_temp": "15°C to 25°C", "cleanliness": "Laboratory Grade"}'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;

INSERT INTO public.research_product_sections (
  form_factor, section_key, section_type, title, eyebrow, position, content_json, status
) VALUES (
  'lab-supplies',
  'key_features',
  'feature_grid',
  'Consumable Quality Standards',
  'Quality Standards',
  30,
  '{
    "features": [
      {
        "title": "Laboratory-Grade Standard",
        "description": "Fabricated to strict analytical specifications for experimental laboratory workflows."
      },
      {
        "title": "Integrity Inspection",
        "description": "Inspected for physical barrier integrity and particulate-free packaging."
      },
      {
        "title": "Lot Documented",
        "description": "Batch tracking number documented for quality control traceability."
      },
      {
        "title": "Chemical Compatibility",
        "description": "Constructed from inert laboratory materials compatible with standard solvents."
      }
    ]
  }'::jsonb,
  'draft'
) ON CONFLICT (form_factor, section_key) WHERE product_id IS NULL AND category_id IS NULL AND form_factor IS NOT NULL DO NOTHING;
