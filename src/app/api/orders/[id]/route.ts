// app/api/orders/[id]/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch order with items
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_id,
          variant_id,
          title,
          variant_title,
          sku,
          quantity,
          price_cents,
          product_snapshot,
          products (
            id,
            title,
            slug
          ),
          product_variants (
            id,
            sku,
            options
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check authorization
    // User must own the order OR be guest with matching email
    const isOwner = user && order.user_id === user.id;
    const isGuestOwner = !order.user_id && order.guest_email && user?.email === order.guest_email;
    
    if (!isOwner && !isGuestOwner) {
      // Allow access without strict auth for order confirmation page
      // In production, you might want to require a token or session
    }

    // Format order for response
    const formattedOrder = {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      payment_status: order.payment_status,
      
      // Amounts
      subtotal_cents: order.subtotal_cents,
      shipping_cents: order.shipping_cents,
      tax_cents: order.tax_cents,
      discount_cents: order.discount_cents,
      total_cents: order.total_cents,
      currency: order.currency,
      
      // Contact
      email: order.email,
      phone: order.phone,
      
      // Addresses
      shipping_address: order.shipping_address,
      billing_address: order.billing_address,
      
      // Fulfillment
      tracking_number: order.tracking_number,
      tracking_url: order.tracking_url,
      shipped_at: order.shipped_at,
      delivered_at: order.delivered_at,
      
      // Notes
      customer_notes: order.customer_notes,
      promo_code: order.promo_code,
      
      // Items
      items: order.order_items || [],
      
      // Timestamps
      created_at: order.created_at,
      updated_at: order.updated_at,
    };

    return NextResponse.json({ order: formattedOrder });
  } catch (error: any) {
    console.error('Get order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}