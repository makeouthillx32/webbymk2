// app/api/cart/items/[id]/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function jsonOk(data: any) {
  return NextResponse.json({ ok: true, data });
}

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

// ─────────────────────────────────────────────
// PATCH /api/cart/items/[id] — update quantity
// ─────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();

    const sessionId = request.headers.get("x-session-id");
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    if (!userId && !sessionId) {
      return jsonError(400, "NO_IDENTITY", "No user or session identified");
    }

    const body = await request.json();
    const { quantity } = body ?? {};

    if (!quantity || quantity < 1 || quantity > 99) {
      return jsonError(400, "BAD_QTY", "Quantity must be between 1 and 99");
    }

    // Fetch item with cart ownership + variant stock info
    const { data: cartItem, error: itemError } = await supabase
      .from("cart_items")
      .select(`
        id,
        cart_id,
        variant_id,
        quantity,
        carts!inner (
          id,
          user_id,
          session_id
        ),
        product_variants (
          inventory_qty,
          track_inventory,
          is_active
        )
      `)
      .eq("id", id)
      .single();

    if (itemError || !cartItem) {
      return jsonError(404, "NOT_FOUND", "Cart item not found");
    }

    // Verify ownership
    const cart = (cartItem as any).carts;
    const isOwner = userId ? cart.user_id === userId : cart.session_id === sessionId;
    if (!isOwner) {
      return jsonError(403, "FORBIDDEN", "Unauthorized");
    }

    // Validate variant availability
    const variant = (cartItem as any).product_variants;

    if (!variant?.is_active) {
      return jsonError(400, "VARIANT_INACTIVE", "This product variant is no longer available");
    }

    // Only enforce stock limit if inventory tracking is enabled
    if (variant.track_inventory && variant.inventory_qty < quantity) {
      return jsonError(400, "OUT_OF_STOCK", `Only ${variant.inventory_qty} items in stock`);
    }

    const { error: updateError } = await supabase
      .from("cart_items")
      .update({ quantity })
      .eq("id", id);

    if (updateError) {
      return jsonError(500, "UPDATE_FAILED", "Failed to update cart item", updateError);
    }

    return jsonOk({ item_id: id, quantity });
  } catch (error) {
    console.error("PATCH cart item error:", error);
    return jsonError(500, "INTERNAL", "Internal server error", error);
  }
}

// ─────────────────────────────────────────────
// DELETE /api/cart/items/[id] — remove item
// ─────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();

    const sessionId = request.headers.get("x-session-id");
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    if (!userId && !sessionId) {
      return jsonError(400, "NO_IDENTITY", "No user or session identified");
    }

    // Fetch item to verify ownership before deleting
    const { data: cartItem, error: itemError } = await supabase
      .from("cart_items")
      .select(`
        id,
        carts!inner (
          id,
          user_id,
          session_id
        )
      `)
      .eq("id", id)
      .single();

    if (itemError || !cartItem) {
      return jsonError(404, "NOT_FOUND", "Cart item not found");
    }

    const cart = (cartItem as any).carts;
    const isOwner = userId ? cart.user_id === userId : cart.session_id === sessionId;
    if (!isOwner) {
      return jsonError(403, "FORBIDDEN", "Unauthorized");
    }

    const { error: deleteError } = await supabase
      .from("cart_items")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return jsonError(500, "DELETE_FAILED", "Failed to delete cart item", deleteError);
    }

    return jsonOk({ item_id: id, deleted: true });
  } catch (error) {
    console.error("DELETE cart item error:", error);
    return jsonError(500, "INTERNAL", "Internal server error", error);
  }
}