-- supabase/migrations/20260905020000_research_fulfillment_gate.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Research-Specific Fulfillment Gate Layer
-- 1. Extends orders and fulfillments with operational audit timestamps and staff checks.
-- 2. Seeds research-oriented packaging presets.
-- 3. Seeds active inventory for physical batches.
-- 4. Creates transactional atomic RPC fulfill_research_order.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Schema Extensions for Orders ──────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS label_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS handed_to_carrier_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS carrier_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS picked_by text,
  ADD COLUMN IF NOT EXISTS picked_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_by text,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS package_preset text,
  ADD COLUMN IF NOT EXISTS package_weight_oz numeric(8, 2),
  ADD COLUMN IF NOT EXISTS fulfillment_audit jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_label_created_at ON public.orders (label_created_at) WHERE label_created_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_handed_to_carrier ON public.orders (handed_to_carrier_at) WHERE handed_to_carrier_at IS NOT NULL;

-- ── 2. Schema Extensions for Fulfillments ────────────────────────────────────
ALTER TABLE public.fulfillments
  ADD COLUMN IF NOT EXISTS label_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS handed_to_carrier_at timestamptz,
  ADD COLUMN IF NOT EXISTS picked_by text,
  ADD COLUMN IF NOT EXISTS checked_by text,
  ADD COLUMN IF NOT EXISTS package_preset text,
  ADD COLUMN IF NOT EXISTS actual_weight_oz numeric(8, 2);

-- ── 3. Seed Research-Oriented Packaging Presets ──────────────────────────────
-- Clear clothing presets and ensure research presets exist
DELETE FROM public.package_presets WHERE name ILIKE '%poly%' OR name ILIKE '%shoe%' OR name ILIKE '%t-shirt%';

INSERT INTO public.package_presets (name, weight_oz, length_in, width_in, height_in, is_active, position, is_default)
VALUES
  ('Insulated Cold-Chain Shipper (Foam + Gel Pack)', 14, 8.0, 6.0, 6.0, true, 0, true),
  ('Padded Cryo/Vial Bubble Mailer (1-4 Vials)', 3, 7.0, 9.0, 1.5, true, 1, false),
  ('Rigid Multi-Vial Laboratory Box (5-10 Vials)', 6, 7.0, 5.0, 3.0, true, 2, false),
  ('Bulk Laboratory Carton (10-30 Vials)', 12, 10.0, 8.0, 5.0, true, 3, false),
  ('Ambient Glassware / Reagent Shipper', 20, 12.0, 10.0, 8.0, true, 4, false)
ON CONFLICT (position) DO UPDATE SET
  name = EXCLUDED.name,
  weight_oz = EXCLUDED.weight_oz,
  length_in = EXCLUDED.length_in,
  width_in = EXCLUDED.width_in,
  height_in = EXCLUDED.height_in,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default;

-- ── 4. Seed Active Batch Inventory ───────────────────────────────────────────
-- Ensure existing physical batches have non-zero remaining_quantity
UPDATE public.research_batches
SET
  initial_quantity = CASE WHEN initial_quantity IS NULL OR initial_quantity = 0 THEN 500 ELSE initial_quantity END,
  remaining_quantity = CASE WHEN remaining_quantity IS NULL OR remaining_quantity = 0 THEN 500 ELSE remaining_quantity END
WHERE status = 'active';

-- ── 5. Transactional Atomic Fulfillment Procedure ────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfill_research_order(
  p_order_id uuid,
  p_tracking_number text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_handed_to_carrier boolean DEFAULT true,
  p_picked_by text DEFAULT NULL,
  p_checked_by text DEFAULT NULL,
  p_package_preset text DEFAULT NULL,
  p_package_weight_oz numeric DEFAULT NULL,
  p_allocations jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_fulfillment_id uuid;
  v_batch_id uuid;
  v_batch RECORD;
  v_coa_count integer;
  v_audit_entry jsonb;
  v_now timestamptz := now();
BEGIN
  -- 1. Fetch and lock order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
  END IF;

  -- 2. Verify Payment Status
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED: Cannot fulfill order with payment status "%". Order must be paid.', v_order.payment_status;
  END IF;

  -- 3. Apply Allocations if provided: jsonb format { "order_item_id": "batch_id", ... }
  IF p_allocations IS NOT NULL AND p_allocations <> '{}'::jsonb THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      IF p_allocations ? v_item.id::text THEN
        v_batch_id := (p_allocations ->> v_item.id::text)::uuid;
        UPDATE public.order_items
        SET allocated_batch_id = v_batch_id
        WHERE id = v_item.id;
      END IF;
    END LOOP;
  END IF;

  -- 4. Verify Every Research Item has a Released Batch & Published COA
  FOR v_item IN
    SELECT oi.*, p.title as product_title
    FROM public.order_items oi
    LEFT JOIN public.research_products p ON p.id = oi.research_product_id
    WHERE oi.order_id = p_order_id AND oi.research_product_id IS NOT NULL
  LOOP
    IF v_item.allocated_batch_id IS NULL THEN
      RAISE EXCEPTION 'BATCH_UNALLOCATED: Item "%" requires a physical batch assignment before fulfillment.', coalesce(v_item.product_title, v_item.title);
    END IF;

    -- Check batch state
    SELECT * INTO v_batch
    FROM public.research_batches
    WHERE id = v_item.allocated_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'BATCH_NOT_FOUND: Allocated batch % does not exist.', v_item.allocated_batch_id;
    END IF;

    IF v_batch.status <> 'active' THEN
      RAISE EXCEPTION 'BATCH_NOT_RELEASED: Batch % status is "%" (not active/released). Cannot fulfill.', v_batch.batch_number, v_batch.status;
    END IF;

    IF v_batch.expiration_date IS NOT NULL AND v_batch.expiration_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'BATCH_EXPIRED: Batch % expired on %. Cannot ship expired compound.', v_batch.batch_number, v_batch.expiration_date;
    END IF;

    IF v_batch.remaining_quantity IS NOT NULL AND v_batch.remaining_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_BATCH_INVENTORY: Batch % has % units remaining, but % requested.', v_batch.batch_number, v_batch.remaining_quantity, v_item.quantity;
    END IF;

    -- Check Published COA
    SELECT count(*) INTO v_coa_count
    FROM public.research_lab_reports
    WHERE (batch_id = v_batch.id OR lot_number = v_batch.batch_number)
      AND published_status = 'published';

    IF v_coa_count = 0 THEN
      RAISE EXCEPTION 'COA_NOT_PUBLISHED: Batch % does not have a verified, published COA.', v_batch.batch_number;
    END IF;

    -- Deduct remaining inventory
    IF v_batch.remaining_quantity IS NOT NULL THEN
      UPDATE public.research_batches
      SET remaining_quantity = remaining_quantity - v_item.quantity,
          updated_at = v_now
      WHERE id = v_batch.id;
    END IF;
  END LOOP;

  -- 5. Upsert Fulfillment record
  SELECT id INTO v_fulfillment_id
  FROM public.fulfillments
  WHERE order_id = p_order_id
  LIMIT 1;

  IF v_fulfillment_id IS NOT NULL THEN
    UPDATE public.fulfillments
    SET
      status = CASE WHEN p_handed_to_carrier THEN 'fulfilled' ELSE status END,
      note = coalesce(p_note, note),
      picked_by = coalesce(p_picked_by, picked_by),
      checked_by = coalesce(p_checked_by, checked_by),
      package_preset = coalesce(p_package_preset, package_preset),
      actual_weight_oz = coalesce(p_package_weight_oz, actual_weight_oz),
      handed_to_carrier_at = CASE WHEN p_handed_to_carrier AND handed_to_carrier_at IS NULL THEN v_now ELSE handed_to_carrier_at END,
      updated_at = v_now
    WHERE id = v_fulfillment_id;
  ELSE
    INSERT INTO public.fulfillments (
      order_id,
      status,
      note,
      picked_by,
      checked_by,
      package_preset,
      actual_weight_oz,
      label_created_at,
      handed_to_carrier_at
    )
    VALUES (
      p_order_id,
      CASE WHEN p_handed_to_carrier THEN 'fulfilled' ELSE 'unfulfilled' END,
      p_note,
      p_picked_by,
      p_checked_by,
      p_package_preset,
      p_package_weight_oz,
      v_now,
      CASE WHEN p_handed_to_carrier THEN v_now ELSE NULL END
    )
    RETURNING id INTO v_fulfillment_id;
  END IF;

  -- 6. Upsert fulfillment_items with REAL quantities (NOT 1!)
  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
    INSERT INTO public.fulfillment_items (fulfillment_id, order_item_id, quantity)
    VALUES (v_fulfillment_id, v_item.id, v_item.quantity)
    ON CONFLICT (fulfillment_id, order_item_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END LOOP;

  -- 7. Add tracking if provided
  IF p_tracking_number IS NOT NULL AND trim(p_tracking_number) <> '' THEN
    INSERT INTO public.fulfillment_tracking (fulfillment_id, tracking_number, tracking_url, carrier)
    VALUES (v_fulfillment_id, trim(p_tracking_number), trim(p_tracking_url), 'USPS')
    ON CONFLICT (fulfillment_id, tracking_number)
    DO UPDATE SET tracking_url = EXCLUDED.tracking_url;
  END IF;

  -- 8. Audit log entry
  v_audit_entry := jsonb_build_object(
    'timestamp', v_now,
    'action', CASE WHEN p_handed_to_carrier THEN 'handed_to_carrier' ELSE 'fulfillment_prepared' END,
    'tracking_number', p_tracking_number,
    'picked_by', p_picked_by,
    'checked_by', p_checked_by,
    'package_preset', p_package_preset,
    'package_weight_oz', p_package_weight_oz
  );

  -- 9. Update orders table
  UPDATE public.orders
  SET
    tracking_number = coalesce(trim(p_tracking_number), tracking_number),
    tracking_url = coalesce(trim(p_tracking_url), tracking_url),
    picked_by = coalesce(p_picked_by, picked_by),
    picked_at = CASE WHEN p_picked_by IS NOT NULL AND picked_at IS NULL THEN v_now ELSE picked_at END,
    checked_by = coalesce(p_checked_by, checked_by),
    checked_at = CASE WHEN p_checked_by IS NOT NULL AND checked_at IS NULL THEN v_now ELSE checked_at END,
    package_preset = coalesce(p_package_preset, package_preset),
    package_weight_oz = coalesce(p_package_weight_oz, package_weight_oz),
    handed_to_carrier_at = CASE WHEN p_handed_to_carrier AND handed_to_carrier_at IS NULL THEN v_now ELSE handed_to_carrier_at END,
    fulfilled_at = CASE WHEN p_handed_to_carrier AND fulfilled_at IS NULL THEN v_now ELSE fulfilled_at END,
    status = CASE WHEN p_handed_to_carrier THEN 'fulfilled' ELSE status END,
    fulfillment_audit = coalesce(fulfillment_audit, '[]'::jsonb) || jsonb_build_array(v_audit_entry),
    updated_at = v_now
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'fulfillment_id', v_fulfillment_id,
    'handed_to_carrier', p_handed_to_carrier,
    'tracking_number', p_tracking_number
  );
END;
$$;
