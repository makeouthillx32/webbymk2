// app/api/orders/[id]/fulfill/route.ts
// PATCH /api/orders/[id]/fulfill
// Body: { tracking_number?: string, tracking_url?: string, note?: string }
// Creates/updates a fulfillment row for the order and links all items.
// The DB trigger then syncs orders.status -> 'fulfilled' automatically.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendOrderShippedEmail } from '@/lib/mail/sendOrderShipped';

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return err(401, 'Unauthorized');

  const { id: orderId } = await params;
  if (!orderId) return err(400, 'Missing order id');

  const body = await req.json().catch(() => ({}));
  const { tracking_number, tracking_url, note } = body;

  // 1) Fetch the order and its items
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_items(id)')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) return err(404, 'Order not found');

  const itemIds: string[] = (order.order_items as any[]).map((i) => i.id);
  if (itemIds.length === 0) return err(400, 'Order has no items');

  // 2) Upsert the fulfillment row
  const { data: existingFulfillments } = await supabase
    .from('fulfillments')
    .select('id')
    .eq('order_id', orderId)
    .limit(1);

  let fulfillmentId: string;

  if (existingFulfillments && existingFulfillments.length > 0) {
    // Update existing
    fulfillmentId = existingFulfillments[0].id;
    const { error: updateErr } = await supabase
      .from('fulfillments')
      .update({ status: 'fulfilled', note: note ?? null, updated_at: new Date().toISOString() })
      .eq('id', fulfillmentId);
    if (updateErr) return err(500, `Failed to update fulfillment: ${updateErr.message}`);
  } else {
    // Create new
    const addr = (order as any).shipping_address;
    const { data: newF, error: insertErr } = await supabase
      .from('fulfillments')
      .insert({ order_id: orderId, status: 'fulfilled', note: note ?? null })
      .select('id')
      .single();
    if (insertErr || !newF) return err(500, `Failed to create fulfillment: ${insertErr?.message}`);
    fulfillmentId = newF.id;
  }

  // 3) Upsert fulfillment_items for each order_item
  const fulfillmentItems = itemIds.map((order_item_id) => ({
    fulfillment_id: fulfillmentId,
    order_item_id,
    quantity: 1, // full qty — the trigger counts distinct items, not quantities
  }));

  const { error: itemsErr } = await supabase
    .from('fulfillment_items')
    .upsert(fulfillmentItems, { onConflict: 'fulfillment_id,order_item_id' });

  if (itemsErr) return err(500, `Failed to create fulfillment items: ${itemsErr.message}`);

  // 4) Add tracking if provided
  if (tracking_number?.trim()) {
    await supabase.from('fulfillment_tracking').upsert(
      {
        fulfillment_id: fulfillmentId,
        tracking_number: tracking_number.trim(),
        tracking_url: tracking_url?.trim() ?? null,
        carrier: null,
      },
      { onConflict: 'fulfillment_id,tracking_number' }
    );
  }

  // 5) Also update orders.tracking_number for convenience
  if (tracking_number?.trim()) {
    await supabase
      .from('orders')
      .update({ tracking_number: tracking_number.trim(), tracking_url: tracking_url?.trim() ?? null })
      .eq('id', orderId);
  }

  // ── Shipped notification email ──────────────────────────────────
  // Non-fatal — the fulfillment itself already succeeded above, matches the
  // pattern used for every other post-fulfillment side effect in this app
  // (see the webhook's order-confirmation email). sendOrderShippedEmail is
  // idempotent (checks orders.shipped_email_sent_at) so repeat PATCH calls
  // for the same order (e.g. adding tracking after an initial fulfill)
  // won't re-send.
  try {
    const result = await sendOrderShippedEmail(
      orderId,
      tracking_number?.trim() || null,
      tracking_url?.trim() || null
    );
    console.log(
      result.sent
        ? `[Mail] ✅ Shipped notice sent for order ${orderId}`
        : `[Mail] ⚠️ Shipped notice not sent: ${result.reason}`
    );
  } catch (mailErr) {
    console.error('[Mail] ⚠️ Failed to send shipped notice:', mailErr);
  }

  return NextResponse.json({ ok: true, fulfillment_id: fulfillmentId });
}