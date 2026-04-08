// app/api/share/cart/[token]/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = await createServerClient();

    // Fetch shared cart
    const { data: cart, error: cartError } = await supabase
      .from('carts')
      .select(`
        id,
        share_token,
        share_enabled,
        share_expires_at,
        share_name,
        share_message,
        shared_by_user_id,
        status,
        cart_items (
          id,
          product_id,
          variant_id,
          quantity,
          price_cents,
          added_note,
          products (
            id,
            title,
            slug
          ),
          product_variants (
            id,
            sku,
            title,
            options
          )
        )
      `)
      .eq('share_token', token)
      .eq('share_enabled', true)
      .single();

    if (cartError || !cart) {
      return NextResponse.json(
        { error: 'Shared cart not found' },
        { status: 404 }
      );
    }

    // Check if share has expired
    if (cart.share_expires_at) {
      const expiresAt = new Date(cart.share_expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'This share link has expired' },
          { status: 410 } // 410 Gone
        );
      }
    }

    // Track view (analytics)
    const viewerSessionId = request.headers.get('x-session-id') || `anon_${Date.now()}`;
    const userAgent = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || '';
    
    // Get IP address
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : null;

    // Track the view (fire and forget - don't wait for it)
    supabase
      .rpc('track_shared_cart_view', {
        p_share_token: token,
        p_viewer_session_id: viewerSessionId,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_referrer: referrer,
      })
      .then(() => {})
      .catch((err) => console.error('Failed to track view:', err));

    // Format cart items
    const items = (cart.cart_items || []).map((item: any) => {
      const product = item.products;
      const variant = item.product_variants;

      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price_cents: item.price_cents,
        product_title: product?.title || 'Unknown Product',
        product_slug: product?.slug || '',
        variant_title: variant?.title || null,
        variant_sku: variant?.sku || null,
        options: variant?.options || null,
        added_note: item.added_note,
      };
    });

    // Calculate totals
    const itemCount = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
    const subtotalCents = items.reduce(
      (sum: number, item: any) => sum + (item.price_cents * item.quantity),
      0
    );

    return NextResponse.json({
      id: cart.id,
      share_name: cart.share_name,
      share_message: cart.share_message,
      items,
      item_count: itemCount,
      subtotal_cents: subtotalCents,
      is_shared: true,
      shared_by_user_id: cart.shared_by_user_id,
    });
  } catch (error) {
    console.error('Shared cart fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}