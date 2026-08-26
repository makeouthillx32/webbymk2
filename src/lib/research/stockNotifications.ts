// lib/research/stockNotifications.ts
//
// Fires "back in stock" emails when a research variant crosses from zero
// (or negative/untracked-to-zero) stock back to available. Called from both
// inventory-movement and admin variant-PATCH write paths — whichever one a
// given restock happens to go through.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail } from "@/lib/mail/client";
import { getMailIdentity, formatFrom } from "@/lib/mail/identities";
import { renderBackInStockEmail } from "@/lib/mail/backInStock";
import { resolveEmailPalette } from "@/lib/mail/theme";
import { getPrimaryImageUrl } from "@/lib/images";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.unenter.live").replace(/\/$/, "");

export async function notifyBackInStockIfRestocked(
  supabase: SupabaseClient,
  variantId: string,
  previousQty: number | null | undefined,
  newQty: number
): Promise<void> {
  try {
    const wasOut = (previousQty ?? 0) <= 0;
    const isNowIn = newQty > 0;
    if (!wasOut || !isNowIn) return;

    const { data: variant, error: variantError } = await supabase
      .from("research_product_variants")
      .select("id, title, product_id, research_products ( id, slug, title )")
      .eq("id", variantId)
      .maybeSingle();

    if (variantError || !variant) return;

    const product = (variant as any).research_products;
    if (!product) return;

    const { data: pending, error: pendingError } = await supabase
      .from("research_stock_notifications")
      .select("id, email, theme_id")
      .is("notified_at", null)
      .or(
        `research_variant_id.eq.${variantId},and(research_variant_id.is.null,research_product_id.eq.${product.id})`
      );

    if (pendingError) {
      console.error("[stock-notify] failed to load pending signups:", pendingError.message);
      return;
    }
    if (!pending || pending.length === 0) return;

    const identity = getMailIdentity("labs");
    const productUrl = `${SITE_URL}/${product.slug}`;

    const { data: productImages } = await supabase
      .from("research_product_images")
      .select("bucket_name, object_path, is_primary, sort_order")
      .eq("product_id", product.id);
    const imageUrl = getPrimaryImageUrl(productImages ?? []);

    const sentIds: string[] = [];
    for (const signup of pending) {
      const palette = await resolveEmailPalette((signup as any).theme_id);
      const { subject, html, text } = renderBackInStockEmail({
        productTitle: product.title,
        variantTitle: (variant as any).title,
        productUrl,
        imageUrl,
        palette,
      });

      const result = await sendMail({
        to: signup.email,
        from: formatFrom(identity),
        replyTo: identity.mailbox,
        subject,
        html,
        text,
        credentials: identity.credentials,
      });
      if (result.sent) sentIds.push(signup.id);
      else console.warn(`[stock-notify] failed to email ${signup.email}:`, result.reason);
    }

    if (sentIds.length > 0) {
      await supabase
        .from("research_stock_notifications")
        .update({ notified_at: new Date().toISOString() })
        .in("id", sentIds);
    }
  } catch (err) {
    // Never let a notification failure block the inventory write that
    // triggered it.
    console.error("[stock-notify] unexpected error:", err);
  }
}
