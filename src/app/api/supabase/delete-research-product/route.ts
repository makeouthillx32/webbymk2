import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (guard.error) return guard.error;

    const { productId } = await request.json();

    if (!productId) {
      return NextResponse.json(
        { success: false, error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Cascading deletes handle:
    // - product_variants (ON DELETE CASCADE)
    // - product_inventory (ON DELETE CASCADE via variant)
    // - product_categories (ON DELETE CASCADE)
    // - product_collections (ON DELETE CASCADE)
    // - product_images (ON DELETE CASCADE)
    const { error } = await guard.admin
      .from("research_products")
      .delete()
      .eq("id", productId);

    if (error) {
      console.error("Supabase deletion error:", error);
      return NextResponse.json(
        { success: false, error: `Deletion failed: ${error.message}` },
        { status: 500 }
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
