// app/api/research-cart/items/[id]/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

function jsonOk(data: any) {
  return NextResponse.json({ ok: true, data });
}

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

// ─────────────────────────────────────────────
// PATCH /api/research-cart/items/[id] — update quantity
// ─────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await createServerClient();
    const supabase = createAdminClient();

    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      return jsonError(401, "AUTH_REQUIRED", "Sign in to manage your research cart");
    }

    const body = await request.json();
    const { quantity } = body ?? {};

    if (!quantity || quantity < 1 || quantity > 99) {
      return jsonError(400, "BAD_QTY", "Quantity must be between 1 and 99");
    }

    const { data: cartItem, error: itemError } = await supabase
      .from("research_cart_items")
      .select(
        `
        id,
        cart_id,
        research_variant_id,
        research_carts!inner ( id, user_id ),
        research_product_variants ( inventory_qty, track_inventory, is_active )
      `
      )
      .eq("id", id)
      .single();

    if (itemError || !cartItem) {
      return jsonError(404, "NOT_FOUND", "Cart item not found");
    }

    const cart = (cartItem as any).research_carts;
    if (cart.user_id !== user.id) {
      return jsonError(403, "FORBIDDEN", "Unauthorized");
    }

    const variant = (cartItem as any).research_product_variants;
    if (variant) {
      if (!variant.is_active) {
        return jsonError(400, "VARIANT_INACTIVE", "This variant is no longer available");
      }
      if (variant.track_inventory && variant.inventory_qty < quantity) {
        return jsonError(400, "OUT_OF_STOCK", `Only ${variant.inventory_qty} items in stock`);
      }
    }

    const { error: updateError } = await supabase
      .from("research_cart_items")
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return jsonError(500, "UPDATE_FAILED", "Failed to update cart item", updateError);
    }

    return jsonOk({ item_id: id, quantity });
  } catch (error) {
    console.error("PATCH research cart item error:", error);
    return jsonError(500, "INTERNAL", "Internal server error", error);
  }
}

// ─────────────────────────────────────────────
// DELETE /api/research-cart/items/[id] — remove item
// ─────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await createServerClient();
    const supabase = createAdminClient();

    const { data: { user } } = await auth.auth.getUser();
    if (!user) {
      return jsonError(401, "AUTH_REQUIRED", "Sign in to manage your research cart");
    }

    const { data: cartItem, error: itemError } = await supabase
      .from("research_cart_items")
      .select(`id, research_carts!inner ( id, user_id )`)
      .eq("id", id)
      .single();

    if (itemError || !cartItem) {
      return jsonError(404, "NOT_FOUND", "Cart item not found");
    }

    const cart = (cartItem as any).research_carts;
    if (cart.user_id !== user.id) {
      return jsonError(403, "FORBIDDEN", "Unauthorized");
    }

    const { error: deleteError } = await supabase
      .from("research_cart_items")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return jsonError(500, "DELETE_FAILED", "Failed to delete cart item", deleteError);
    }

    return jsonOk({ item_id: id, deleted: true });
  } catch (error) {
    console.error("DELETE research cart item error:", error);
    return jsonError(500, "INTERNAL", "Internal server error", error);
  }
}
