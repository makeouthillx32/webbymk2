-- Labs fulfillment parity and explicit missing-COA acknowledgement.
--
-- The storefront catalog historically had hundreds of active products but only
-- a small set of allocatable batches. Seed one minimal, clearly-marked catalog
-- batch for each active product that has no usable batch. Recorded variant
-- inventory is preserved; otherwise the bootstrap quantity is one unit so this
-- migration never invents bulk stock.

INSERT INTO public.research_batches (
  product_id,
  variant_id,
  batch_number,
  status,
  is_current_shipping,
  initial_quantity,
  remaining_quantity,
  notes
)
SELECT
  p.id,
  NULL,
  'CAT-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || left(replace(p.id::text, '-', ''), 8),
  'active',
  true,
  greatest(coalesce(sum(CASE WHEN v.is_active THEN greatest(v.inventory_qty, 0) ELSE 0 END), 0), 1)::integer,
  greatest(coalesce(sum(CASE WHEN v.is_active THEN greatest(v.inventory_qty, 0) ELSE 0 END), 0), 1)::integer,
  'Catalog inventory bootstrap. Physical lot metadata is pending; no COA is implied by this batch.'
FROM public.research_products p
LEFT JOIN public.research_product_variants v ON v.product_id = p.id
WHERE p.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.research_batches existing
    WHERE existing.product_id = p.id
      AND existing.status = 'active'
      AND coalesce(existing.remaining_quantity, 0) > 0
  )
GROUP BY p.id;

DROP FUNCTION IF EXISTS public.fulfill_research_order(
  uuid, text, text, text, boolean, text, text, text, numeric, jsonb
);

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
  p_allocations jsonb DEFAULT NULL,
  p_acknowledge_missing_coa boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_fulfillment_id uuid;
  v_batch_id uuid;
  v_batch RECORD;
  v_coa_count integer;
  v_quality_warnings jsonb := '[]'::jsonb;
  v_audit_entry jsonb;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
  END IF;

  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED: Cannot fulfill order with payment status "%". Order must be paid.', v_order.payment_status;
  END IF;

  IF p_allocations IS NOT NULL AND p_allocations <> '{}'::jsonb THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      IF p_allocations ? v_item.id::text THEN
        v_batch_id := (p_allocations ->> v_item.id::text)::uuid;

        SELECT * INTO v_batch
        FROM public.research_batches
        WHERE id = v_batch_id;

        IF NOT FOUND OR v_batch.product_id IS DISTINCT FROM v_item.research_product_id THEN
          RAISE EXCEPTION 'INVALID_BATCH: Batch % does not belong to order item %.', v_batch_id, v_item.id;
        END IF;

        IF v_batch.variant_id IS NOT NULL
          AND v_item.research_variant_id IS NOT NULL
          AND v_batch.variant_id IS DISTINCT FROM v_item.research_variant_id THEN
          RAISE EXCEPTION 'VARIANT_BATCH_MISMATCH: Batch % does not match the ordered variant.', v_batch.batch_number;
        END IF;

        UPDATE public.order_items
        SET allocated_batch_id = v_batch_id
        WHERE id = v_item.id;
      END IF;
    END LOOP;
  END IF;

  FOR v_item IN
    SELECT oi.*, p.title AS product_title
    FROM public.order_items oi
    LEFT JOIN public.research_products p ON p.id = oi.research_product_id
    WHERE oi.order_id = p_order_id AND oi.research_product_id IS NOT NULL
  LOOP
    IF v_item.allocated_batch_id IS NULL THEN
      RAISE EXCEPTION 'BATCH_UNALLOCATED: Item "%" requires a physical batch assignment before fulfillment.', coalesce(v_item.product_title, v_item.title);
    END IF;

    SELECT * INTO v_batch
    FROM public.research_batches
    WHERE id = v_item.allocated_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'BATCH_NOT_FOUND: Allocated batch % does not exist.', v_item.allocated_batch_id;
    END IF;

    IF v_batch.product_id IS DISTINCT FROM v_item.research_product_id THEN
      RAISE EXCEPTION 'INVALID_BATCH: Batch % does not belong to item "%".', v_batch.batch_number, coalesce(v_item.product_title, v_item.title);
    END IF;

    IF v_batch.variant_id IS NOT NULL
      AND v_item.research_variant_id IS NOT NULL
      AND v_batch.variant_id IS DISTINCT FROM v_item.research_variant_id THEN
      RAISE EXCEPTION 'VARIANT_BATCH_MISMATCH: Batch % does not match the ordered variant.', v_batch.batch_number;
    END IF;

    IF v_batch.status <> 'active' THEN
      RAISE EXCEPTION 'BATCH_NOT_RELEASED: Batch % status is "%". Cannot fulfill.', v_batch.batch_number, v_batch.status;
    END IF;

    IF v_batch.expiration_date IS NOT NULL AND v_batch.expiration_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'BATCH_EXPIRED: Batch % expired on %. Cannot ship expired compound.', v_batch.batch_number, v_batch.expiration_date;
    END IF;

    IF v_batch.remaining_quantity IS NOT NULL AND v_batch.remaining_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_BATCH_INVENTORY: Batch % has % units remaining, but % requested.', v_batch.batch_number, v_batch.remaining_quantity, v_item.quantity;
    END IF;

    SELECT count(*) INTO v_coa_count
    FROM public.research_lab_reports
    WHERE (batch_id = v_batch.id OR lot_number = v_batch.batch_number)
      AND published_status = 'published';

    IF v_coa_count = 0 THEN
      v_quality_warnings := v_quality_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'MISSING_PUBLISHED_COA',
        'item_id', v_item.id,
        'batch_id', v_batch.id,
        'batch_number', v_batch.batch_number,
        'product', coalesce(v_item.product_title, v_item.title)
      ));

      IF NOT p_acknowledge_missing_coa THEN
        RAISE EXCEPTION 'COA_ACKNOWLEDGEMENT_REQUIRED: Batch % has no published COA. Staff acknowledgement is required.', v_batch.batch_number;
      END IF;
    END IF;

    IF v_batch.remaining_quantity IS NOT NULL THEN
      UPDATE public.research_batches
      SET remaining_quantity = remaining_quantity - v_item.quantity,
          updated_at = v_now
      WHERE id = v_batch.id;
    END IF;
  END LOOP;

  SELECT id INTO v_fulfillment_id
  FROM public.fulfillments
  WHERE order_id = p_order_id
  LIMIT 1;

  IF v_fulfillment_id IS NOT NULL THEN
    UPDATE public.fulfillments
    SET status = CASE WHEN p_handed_to_carrier THEN 'fulfilled' ELSE status END,
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
      order_id, status, note, picked_by, checked_by, package_preset,
      actual_weight_oz, label_created_at, handed_to_carrier_at
    ) VALUES (
      p_order_id,
      CASE WHEN p_handed_to_carrier THEN 'fulfilled' ELSE 'unfulfilled' END,
      p_note, p_picked_by, p_checked_by, p_package_preset,
      p_package_weight_oz, v_now,
      CASE WHEN p_handed_to_carrier THEN v_now ELSE NULL END
    ) RETURNING id INTO v_fulfillment_id;
  END IF;

  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
    INSERT INTO public.fulfillment_items (fulfillment_id, order_item_id, quantity)
    VALUES (v_fulfillment_id, v_item.id, v_item.quantity)
    ON CONFLICT (fulfillment_id, order_item_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END LOOP;

  IF p_tracking_number IS NOT NULL AND trim(p_tracking_number) <> '' THEN
    INSERT INTO public.fulfillment_tracking (fulfillment_id, tracking_number, tracking_url, carrier)
    VALUES (v_fulfillment_id, trim(p_tracking_number), trim(p_tracking_url), 'USPS')
    ON CONFLICT (fulfillment_id, tracking_number)
    DO UPDATE SET tracking_url = EXCLUDED.tracking_url;
  END IF;

  v_audit_entry := jsonb_build_object(
    'timestamp', v_now,
    'action', CASE WHEN p_handed_to_carrier THEN 'handed_to_carrier' ELSE 'fulfillment_prepared' END,
    'tracking_number', p_tracking_number,
    'picked_by', p_picked_by,
    'checked_by', p_checked_by,
    'package_preset', p_package_preset,
    'package_weight_oz', p_package_weight_oz,
    'quality_warnings', v_quality_warnings,
    'missing_coa_acknowledged', jsonb_array_length(v_quality_warnings) > 0 AND p_acknowledge_missing_coa
  );

  UPDATE public.orders
  SET tracking_number = coalesce(trim(p_tracking_number), tracking_number),
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
    'tracking_number', p_tracking_number,
    'quality_warnings', v_quality_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_research_order(
  uuid, text, text, text, boolean, text, text, text, numeric, jsonb, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fulfill_research_order(
  uuid, text, text, text, boolean, text, text, text, numeric, jsonb, boolean
) TO service_role;
