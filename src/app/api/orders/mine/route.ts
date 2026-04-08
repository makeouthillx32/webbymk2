// app/api/orders/mine/route.ts
// Returns all orders for the currently authenticated member.
// Matches by auth_user_id — the field set on every logged-in purchase.
// Returns 401 for unauthenticated requests (guests have no account to look up).

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resolveFulfillmentStatus } from '@/lib/orders/resolveFulfillmentStatus';

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      created_at,
      status,
      payment_status,
      subtotal_cents,
      shipping_cents,
      tax_cents,
      discount_cents,
      total_cents,
      email,
      shipping_address,
      shipping_method_name,
      tracking_number,
      tracking_url,
      fulfillments (
        status
      ),
      order_items (
        id,
        sku,
        product_title,
        variant_title,
        quantity,
        price_cents
      )
    `)
    .eq('auth_user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[API /orders/mine]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []).map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    created_at: o.created_at,
    status: o.status,
    payment_status: o.payment_status,
    fulfillment_status: resolveFulfillmentStatus(o.fulfillments?.[0], o.status),
    subtotal_cents: o.subtotal_cents ?? 0,
    shipping_cents: o.shipping_cents ?? 0,
    tax_cents: o.tax_cents ?? 0,
    discount_cents: o.discount_cents ?? 0,
    total_cents: o.total_cents,
    email: o.email,
    shipping_address: o.shipping_address,
    shipping_method_name: o.shipping_method_name,
    tracking_number: o.tracking_number ?? null,
    tracking_url: o.tracking_url ?? null,
    // 1 point per $1 of subtotal — member only, display only until backend is wired
    points_earned: Math.floor((o.subtotal_cents ?? o.total_cents) / 100),
    items: (o.order_items ?? []).map((item: any) => ({
      id: item.id,
      sku: item.sku ?? '',
      title: item.product_title ?? '',
      variant_title: item.variant_title ?? '',
      quantity: item.quantity,
      price_cents: item.price_cents,
    })),
  }));

  return NextResponse.json({ orders });
}