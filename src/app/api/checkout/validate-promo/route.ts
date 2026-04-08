// app/api/checkout/validate-promo/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || null;

    const body = await request.json();
    const { code, subtotal_cents } = body;

    if (!code || !subtotal_cents) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate and calculate discount via DB function
    const { data, error } = await supabase
      .rpc('apply_promo_code', {
        p_code: code.toUpperCase(),
        p_subtotal_cents: subtotal_cents,
        p_user_id: userId,
      });

    if (error) {
      console.error('Promo validation error:', error);
      return NextResponse.json(
        { error: 'Failed to validate promo code' },
        { status: 500 }
      );
    }

    const result = data[0];

    if (!result.is_valid) {
      return NextResponse.json(
        { valid: false, error: result.error_message },
        { status: 200 }
      );
    }

    // Fetch display details from the discounts table (admin-managed source of truth)
    const { data: discount } = await supabase
      .from('discounts')
      .select('code, type, percent_off, amount_off_cents')
      .eq('code', code.toUpperCase())
      .single();

    // Build a friendly description so the green badge has something to show
    let description = '';
    if (discount?.type === 'percentage' && discount?.percent_off) {
      description = `${discount.percent_off}% off your order`;
    } else if (discount?.type === 'fixed' && discount?.amount_off_cents) {
      description = `$${(discount.amount_off_cents / 100).toFixed(2)} off your order`;
    }

    const promoCode = {
      code: code.toUpperCase(),
      description,
      discount_type: discount?.type ?? 'percentage',
      discount_value: discount?.percent_off ?? discount?.amount_off_cents ?? 0,
    };

    return NextResponse.json({
      valid: true,
      discount_cents: result.discount_cents,
      promo_code: promoCode,
      message: `Promo code "${code}" applied successfully!`,
    });
  } catch (error: any) {
    console.error('Validate promo error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}