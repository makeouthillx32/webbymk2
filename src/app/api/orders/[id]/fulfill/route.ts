// app/api/orders/[id]/fulfill/route.ts
// PATCH /api/orders/[id]/fulfill
//
// Research-Specific Transactional Fulfillment:
// 1. Strict admin authorization gate.
// 2. Calls atomic Postgres RPC fulfill_research_order.
// 3. Atomically verifies payment, batch status, inventory, and published COA.
// 4. Sets accurate line item quantities (not 1!).
// 5. Separates "label created" from "handed to carrier / shipped".
// 6. Only triggers customer shipping notification email when handed_to_carrier is confirmed.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireAdminClient } from '@/lib/require-admin';
import { sendOrderShippedEmail } from '@/lib/mail/sendOrderShipped';

function err(status: number, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const gate = await requireAdminClient(supabase);
  if (!gate.ok) return err(gate.status, gate.message);
  const admin = createAdminClient();

  const { id: orderId } = await params;
  if (!orderId) return err(400, 'Missing order id');

  const body = await req.json().catch(() => ({}));
  const {
    tracking_number,
    tracking_url,
    note,
    handed_to_carrier = true,
    picked_by,
    checked_by,
    package_preset,
    package_weight_oz,
    allocations,
  } = body;

  // 1. Call transactional atomic procedure
  const { data: result, error: rpcError } = await admin.rpc('fulfill_research_order', {
    p_order_id: orderId,
    p_tracking_number: tracking_number?.trim() || null,
    p_tracking_url: tracking_url?.trim() || null,
    p_note: note?.trim() || null,
    p_handed_to_carrier: Boolean(handed_to_carrier),
    p_picked_by: picked_by?.trim() || null,
    p_checked_by: checked_by?.trim() || null,
    p_package_preset: package_preset?.trim() || null,
    p_package_weight_oz: typeof package_weight_oz === 'number' ? package_weight_oz : null,
    p_allocations: allocations && typeof allocations === 'object' ? allocations : null,
  });

  if (rpcError) {
    console.error('[Order Fulfill RPC] Error:', rpcError);
    return err(422, rpcError.message);
  }

  // 2. Send shipped notification email ONLY if handed to carrier
  if (handed_to_carrier) {
    try {
      const mailResult = await sendOrderShippedEmail(
        orderId,
        tracking_number?.trim() || null,
        tracking_url?.trim() || null
      );
      console.log(
        mailResult.sent
          ? `[Mail] ✅ Shipped notice sent for order ${orderId}`
          : `[Mail] ⚠️ Shipped notice not sent: ${mailResult.reason}`
      );
    } catch (mailErr) {
      console.error('[Mail] ⚠️ Failed to send shipped notice:', mailErr);
    }
  }

  return NextResponse.json({ ok: true, data: result });
}
