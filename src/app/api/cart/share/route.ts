// app/api/cart/share/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// POST - Enable cart sharing
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    
    const sessionId = request.headers.get('x-session-id');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    if (!userId && !sessionId) {
      return NextResponse.json(
        { error: 'No user or session identified' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { 
      cart_id, 
      share_name, 
      share_message, 
      days_valid = 30 
    } = body;

    if (!cart_id) {
      return NextResponse.json(
        { error: 'cart_id is required' },
        { status: 400 }
      );
    }

    // Verify cart ownership
    let cartQuery = supabase
      .from('carts')
      .select('id')
      .eq('id', cart_id)
      .single();

    if (userId) {
      cartQuery = cartQuery.eq('user_id', userId);
    } else {
      cartQuery = cartQuery.eq('session_id', sessionId);
    }

    const { data: cart, error: cartError } = await cartQuery;

    if (cartError || !cart) {
      return NextResponse.json(
        { error: 'Cart not found or unauthorized' },
        { status: 404 }
      );
    }

    // Call database function to enable sharing
    const { data, error } = await supabase
      .rpc('enable_cart_sharing', {
        p_cart_id: cart_id,
        p_share_name: share_name || null,
        p_share_message: share_message || null,
        p_days_valid: days_valid,
      });

    if (error) {
      console.error('Failed to enable sharing:', error);
      return NextResponse.json(
        { error: 'Failed to enable sharing' },
        { status: 500 }
      );
    }

    const result = data[0]; // RPC returns array

    return NextResponse.json({
      success: true,
      share_token: result.share_token,
      share_url: result.share_url,
      message: 'Cart sharing enabled',
    });
  } catch (error) {
    console.error('Enable sharing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Disable cart sharing
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    
    const sessionId = request.headers.get('x-session-id');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    if (!userId && !sessionId) {
      return NextResponse.json(
        { error: 'No user or session identified' },
        { status: 400 }
      );
    }

    // Find user's cart
    let cartQuery = supabase
      .from('carts')
      .select('id')
      .eq('status', 'active')
      .single();

    if (userId) {
      cartQuery = cartQuery.eq('user_id', userId);
    } else {
      cartQuery = cartQuery.eq('session_id', sessionId);
    }

    const { data: cart, error: cartError } = await cartQuery;

    if (cartError || !cart) {
      return NextResponse.json(
        { error: 'Cart not found' },
        { status: 404 }
      );
    }

    // Call database function to disable sharing
    const { error } = await supabase
      .rpc('disable_cart_sharing', {
        p_cart_id: cart.id,
      });

    if (error) {
      console.error('Failed to disable sharing:', error);
      return NextResponse.json(
        { error: 'Failed to disable sharing' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cart sharing disabled',
    });
  } catch (error) {
    console.error('Disable sharing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}