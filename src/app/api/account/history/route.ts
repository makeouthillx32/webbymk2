// app/api/account/history/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    // Fetch orders for this user with items
    const { data: orders, error, count } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        payment_status,
        status,
        subtotal_cents,
        discount_cents,
        shipping_cents,
        tax_cents,
        total_cents,
        currency,
        promo_code,
        shipping_method_name,
        shipping_address,
        customer_email,
        email,
        created_at,
        order_items (
          id,
          product_id,
          variant_id,
          product_title,
          variant_title,
          sku,
          quantity,
          price_cents,
          compare_at_price_cents,
          currency,
          product_snapshot
        )
      `, { count: "exact" })
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
      .in("payment_status", ["paid", "refunded"])
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Order history error:", error);
      return NextResponse.json({ error: "Failed to fetch order history" }, { status: 500 });
    }

    return NextResponse.json({
      orders: orders || [],
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error("Order history route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}