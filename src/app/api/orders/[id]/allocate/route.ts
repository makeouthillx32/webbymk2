// app/api/orders/[id]/allocate/route.ts
//
// Research Fulfillment Pre-flight & Batch Allocation API
// GET: Returns order items, current batch allocations, available batches, and COA status.
// POST: Persists physical batch allocations for order items.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdminClient } from "@/lib/require-admin";

type Params = { params: Promise<{ id: string }> };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export async function GET(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdminClient(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  const admin = createAdminClient();

  const { id: orderId } = await params;

  // 1. Fetch order details
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      payment_status,
      shipping_address,
      tracking_number,
      tracking_url,
      label_pdf_path,
      label_created_at,
      handed_to_carrier_at,
      fulfilled_at,
      picked_by,
      checked_by,
      package_preset,
      package_weight_oz,
      fulfillment_audit
    `)
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return jsonError(404, "ORDER_NOT_FOUND", "Order not found");

  // 2. Fetch order items
  const { data: items, error: itemsErr } = await admin
    .from("order_items")
    .select(`
      id,
      product_id,
      research_product_id,
      research_variant_id,
      title,
      product_title,
      variant_title,
      quantity,
      price_cents,
      sku,
      allocated_batch_id,
      research_batches (
        id,
        batch_number,
        status,
        is_current_shipping,
        remaining_quantity,
        manufactured_date,
        expiration_date
      )
    `)
    .eq("order_id", orderId);

  if (itemsErr) return jsonError(500, "ITEMS_FETCH_FAILED", itemsErr.message);

  // 3. For research items, fetch all available batches for their product
  const researchProductIds = Array.from(
    new Set((items ?? []).map((i) => i.research_product_id).filter(Boolean))
  );

  let batchesByProduct: Record<string, any[]> = {};
  if (researchProductIds.length > 0) {
    const { data: batches } = await admin
      .from("research_batches")
      .select(`
        id,
        product_id,
        variant_id,
        batch_number,
        status,
        is_current_shipping,
        remaining_quantity,
        manufactured_date,
        expiration_date,
        research_lab_reports (
          id,
          coa_number,
          access_code,
          purity_pct,
          published_status,
          pdf_url,
          paper_image_url
        )
      `)
      .in("product_id", researchProductIds)
      .order("is_current_shipping", { ascending: false });

    for (const b of batches ?? []) {
      if (!batchesByProduct[b.product_id]) batchesByProduct[b.product_id] = [];
      batchesByProduct[b.product_id].push(b);
    }
  }

  // 4. Pre-flight checklist readiness assessment
  const addr = order.shipping_address as any;
  const isAddressValid = Boolean(addr?.address1 && addr?.city && addr?.state && addr?.zip);
  const isPaid = order.payment_status === "paid";

  const researchItems = (items ?? []).filter((i) => !!i.research_product_id);
  const unallocatedItems = researchItems.filter((i) => !i.allocated_batch_id);

  const expiredBatches = researchItems.filter((i) => {
    const b = i.research_batches as any;
    return b?.expiration_date && new Date(b.expiration_date) < new Date();
  });

  const unreleasedBatches = researchItems.filter((i) => {
    const b = i.research_batches as any;
    return b && b.status !== "active";
  });

  const availableBatchesForItem = (item: any) =>
    (batchesByProduct[item.research_product_id] || []).filter(
      (batch: any) => !batch.variant_id || !item.research_variant_id || batch.variant_id === item.research_variant_id
    );

  const missingCoaItems = researchItems.filter((item: any) => {
    if (!item.allocated_batch_id) return false;
    const batch = availableBatchesForItem(item).find((candidate: any) => candidate.id === item.allocated_batch_id);
    return !batch?.research_lab_reports?.some((report: any) => report.published_status === "published");
  });

  const canGenerateLabel =
    isPaid &&
    isAddressValid &&
    unallocatedItems.length === 0 &&
    expiredBatches.length === 0 &&
    unreleasedBatches.length === 0;

  return NextResponse.json({
    ok: true,
    data: {
      order,
      items: (items ?? []).map((item) => ({
        ...item,
        available_batches: item.research_product_id ? availableBatchesForItem(item) : [],
      })),
      readiness: {
        is_paid: isPaid,
        is_address_valid: isAddressValid,
        total_items: items?.length ?? 0,
        research_items: researchItems.length,
        unallocated_count: unallocatedItems.length,
        expired_count: expiredBatches.length,
        unreleased_count: unreleasedBatches.length,
        missing_coa_count: missingCoaItems.length,
        requires_coa_acknowledgement: missingCoaItems.length > 0,
        can_generate_label: canGenerateLabel,
      },
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdminClient(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  const admin = createAdminClient();

  const { id: orderId } = await params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const allocations = body?.allocations;
  if (!allocations || typeof allocations !== "object") {
    return jsonError(400, "INVALID_INPUT", "allocations object mapping order_item_id to batch_id is required");
  }

  const entries = Object.entries(allocations).filter(([, batchId]) => Boolean(batchId));
  const itemIds = entries.map(([itemId]) => itemId);
  const batchIds = entries.map(([, batchId]) => String(batchId));

  const { data: items, error: itemsError } = itemIds.length
    ? await admin
        .from("order_items")
        .select("id, order_id, research_product_id, research_variant_id, quantity")
        .eq("order_id", orderId)
        .in("id", itemIds)
    : { data: [], error: null };

  if (itemsError) return jsonError(500, "ITEMS_FETCH_FAILED", itemsError.message);
  if ((items ?? []).length !== itemIds.length) {
    return jsonError(400, "INVALID_ALLOCATION_ITEM", "One or more order items do not belong to this order");
  }

  const { data: batches, error: batchesError } = batchIds.length
    ? await admin
        .from("research_batches")
        .select("id, product_id, variant_id, status, expiration_date, remaining_quantity")
        .in("id", batchIds)
    : { data: [], error: null };

  if (batchesError) return jsonError(500, "BATCHES_FETCH_FAILED", batchesError.message);
  const itemById = new Map((items ?? []).map((item: any) => [item.id, item]));
  const batchById = new Map((batches ?? []).map((batch: any) => [batch.id, batch]));

  for (const [itemId, rawBatchId] of entries) {
    const batchId = String(rawBatchId);
    const item: any = itemById.get(itemId);
    const batch: any = batchById.get(batchId);
    if (!batch || batch.product_id !== item.research_product_id) {
      return jsonError(400, "INVALID_BATCH", "Selected batch does not belong to the order item's research product");
    }
    if (batch.variant_id && item.research_variant_id && batch.variant_id !== item.research_variant_id) {
      return jsonError(400, "VARIANT_BATCH_MISMATCH", "Selected batch does not match the ordered variant");
    }
    if (batch.status !== "active") {
      return jsonError(422, "BATCH_NOT_RELEASED", "Only active batches can be allocated");
    }
    if (batch.expiration_date && new Date(batch.expiration_date) < new Date()) {
      return jsonError(422, "BATCH_EXPIRED", "Expired batches cannot be allocated");
    }
    if (batch.remaining_quantity != null && batch.remaining_quantity < item.quantity) {
      return jsonError(422, "INSUFFICIENT_BATCH_INVENTORY", "Selected batch does not have enough remaining inventory");
    }
  }

  // Persist only after every allocation validates.
  for (const [itemId, batchId] of entries) {
    if (batchId) {
      const { error } = await admin
        .from("order_items")
        .update({ allocated_batch_id: batchId })
        .eq("id", itemId)
        .eq("order_id", orderId);

      if (error) return jsonError(500, "ALLOCATION_UPDATE_FAILED", error.message);
    }
  }

  return NextResponse.json({ ok: true, message: "Batches allocated successfully" });
}
