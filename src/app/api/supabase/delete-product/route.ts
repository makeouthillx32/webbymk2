import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Use the Supabase REST API directly
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { success: false, error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    // Delete the product - cascading deletes will handle:
    // - product_variants (ON DELETE CASCADE)
    // - product_inventory (ON DELETE CASCADE via variant)
    // - product_categories (ON DELETE CASCADE)
    // - product_collections (ON DELETE CASCADE)
    // - product_images (ON DELETE CASCADE)
    const response = await fetch(`${supabaseUrl}/rest/v1/products?id=eq.${productId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Supabase deletion error:", errorText);
      return NextResponse.json(
        { success: false, error: `Deletion failed: ${errorText}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: "Product and all related data deleted successfully"
    });

  } catch (error: any) {
    console.error("Delete product error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}