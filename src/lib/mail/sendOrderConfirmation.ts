// lib/mail/sendOrderConfirmation.ts
// Fetches everything the template needs and sends the receipt. Called from
// the Stripe webhook right after an order is marked paid.
import { createAdminClient } from "@/utils/supabase/admin";
import { sendMail } from "./client";
import { getMailIdentity, formatFrom } from "./identities";
import { renderOrderConfirmationEmail, type OrderForEmail, type OrderItemForEmail } from "./orderConfirmation";
import { resolveEmailPalette } from "./theme";
import { fetchItemImageMap, imageUrlForItem } from "./orderItemImages";

export async function sendOrderConfirmationEmail(orderId: string): Promise<{ sent: boolean; reason?: string }> {
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      `
      id, order_number, created_at, email, customer_first_name, customer_last_name,
      subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
      promo_code, shipping_method_name, order_source, shipping_address, billing_address,
      payment_method_brand, payment_method_last4, theme_id
    `
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error("[mail] Could not load order for confirmation email:", orderError?.message);
    return { sent: false, reason: orderError?.message ?? "Order not found" };
  }

  if (!order.email) {
    console.warn(`[mail] Order ${orderId} has no email on file — skipping confirmation.`);
    return { sent: false, reason: "No email on order" };
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("product_title, variant_title, quantity, price_cents, product_id, research_product_id")
    .eq("order_id", orderId);

  if (itemsError) {
    console.error("[mail] Could not load order items for confirmation email:", itemsError.message);
  }

  const rawItems = items ?? [];
  const imageMap = await fetchItemImageMap(admin, rawItems);
  const itemsWithImages: OrderItemForEmail[] = rawItems.map((item) => ({
    ...(item as OrderItemForEmail),
    imageUrl: imageUrlForItem(item, imageMap),
  }));

  const palette = await resolveEmailPalette((order as any).theme_id);

  const { subject, html, text } = renderOrderConfirmationEmail(
    order as OrderForEmail,
    itemsWithImages,
    palette
  );

  const isResearch = order.order_source === "research";
  const identity = getMailIdentity(isResearch ? "labs" : "support");

  return sendMail({
    to: order.email,
    from: formatFrom(identity),
    replyTo: identity.mailbox,
    subject,
    html,
    text,
    // Each mailbox authenticates as itself — poste.io (like most mail
    // servers) rejects a From that doesn't match the logged-in user.
    // Falls back to the shared SMTP_USER/PASS (client.ts) if this branch's
    // own credentials aren't set yet.
    credentials: identity.credentials,
    order_id: order.id,
  });
}
