// app/api/checkout/calculate-tax/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const body = await request.json();
    const { subtotal_cents, shipping_cents, state } = body;

    if (!subtotal_cents || !state) {
      return NextResponse.json(
        { error: 'subtotal_cents and state are required' },
        { status: 400 }
      );
    }

    console.log('Calculating tax for:', { subtotal_cents, shipping_cents, state });

    // Query tax rates for the state
    const { data: taxRates, error } = await supabase
      .from('tax_rates')
      .select('rate, type, description')
      .eq('state', state.toUpperCase())
      .eq('is_active', true);

    if (error) {
      console.error('Tax rates query error:', error);
      return NextResponse.json(
        { error: 'Failed to load tax rates', details: error.message },
        { status: 500 }
      );
    }

    console.log('Tax rates from DB:', taxRates);

    // Calculate total tax rate
    const totalRate = taxRates?.reduce((sum, rate) => sum + Number(rate.rate), 0) || 0;

    // Calculate taxable amount (subtotal + shipping)
    const taxableAmount = subtotal_cents + (shipping_cents || 0);

    // Calculate tax
    const tax_cents = Math.round(taxableAmount * totalRate);

    console.log('Tax calculation:', { totalRate, taxableAmount, tax_cents });

    return NextResponse.json({
      tax_cents,
      tax_rate: totalRate,
      tax_breakdown: taxRates || [],
      state: state.toUpperCase(),
    });
  } catch (error: any) {
    console.error('Tax calculation API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}