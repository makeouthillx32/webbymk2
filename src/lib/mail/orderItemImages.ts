// lib/mail/orderItemImages.ts
// Looks up a primary product photo per order_items row, for the order
// confirmation/shipped email redesign (product thumbnails, like a normal
// e-commerce receipt). Shop rows carry product_id, research rows carry
// research_product_id — order_items uses one or the other, never both.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPrimaryImageUrl, type DbImage } from "@/lib/images";

export type OrderItemRow = {
  product_title: string;
  variant_title?: string | null;
  quantity: number;
  price_cents?: number;
  product_id?: string | null;
  research_product_id?: string | null;
};

/** Returns a Map keyed by (product_id ?? research_product_id) -> public image URL. */
export async function fetchItemImageMap(
  admin: SupabaseClient,
  items: OrderItemRow[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  const researchProductIds = [...new Set(items.map((i) => i.research_product_id).filter(Boolean))] as string[];

  try {
    if (productIds.length) {
      const { data } = await admin
        .from("product_images")
        .select("product_id, bucket_name, object_path, is_primary, sort_order")
        .in("product_id", productIds);

      const byProduct = new Map<string, DbImage[]>();
      for (const row of data ?? []) {
        const list = byProduct.get(row.product_id) ?? [];
        list.push(row as DbImage);
        byProduct.set(row.product_id, list);
      }
      for (const [pid, images] of byProduct) {
        const url = getPrimaryImageUrl(images);
        if (url) map.set(pid, url);
      }
    }

    if (researchProductIds.length) {
      const { data } = await admin
        .from("research_product_images")
        .select("product_id, bucket_name, object_path, is_primary, sort_order")
        .in("product_id", researchProductIds);

      const byProduct = new Map<string, DbImage[]>();
      for (const row of data ?? []) {
        const list = byProduct.get(row.product_id) ?? [];
        list.push(row as DbImage);
        byProduct.set(row.product_id, list);
      }
      for (const [pid, images] of byProduct) {
        const url = getPrimaryImageUrl(images);
        if (url) map.set(pid, url);
      }
    }
  } catch (err) {
    // Non-fatal — the email still sends fine without thumbnails.
    console.error("[mail] Failed to fetch order item images:", err);
  }

  return map;
}

export function imageUrlForItem(item: OrderItemRow, map: Map<string, string>): string | null {
  const key = item.product_id ?? item.research_product_id;
  return key ? map.get(key) ?? null : null;
}
