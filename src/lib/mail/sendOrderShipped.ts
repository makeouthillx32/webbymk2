// lib/mail/sendOrderShipped.ts
// Fetches everything the template needs and sends the shipment notice.
// Called from PATCH /api/orders/[id]/fulfill right after an order is marked
// fulfilled — mirrors sendOrderConfirmation.ts's pattern exactly (direct
// app-code call, not the dead DB trigger that used to point at a
// deprovisioned hosted-Supabase Edge Function).
import { createAdminClient } from "@/utils/supabase/admin";
import { sendMail } from "./client";
import { getMailIdentity, formatFrom } from "./identities";
import { renderOrderShippedEmail, type ShippedOrderForEmail, type ShippedItemForEmail } from "./orderShipped";
import { resolveEmailPalette } from "./theme";

export async function sendOrderShippedEmail(
  orderId: string,
  trackingNumber: string | null,
  trackingUrl: string | null
): Promise<{ sent: boolean; reason?: string }> {
  const admin = createAdminClient();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      `
      id, order_number, email, customer_first_name, customer_last_name,
      order_source, shipping_address, shipping_method_name,
      shipped_email_sent_at, theme_id
    `
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error("[mail] Could not load order for shipped email:", orderError?.message);
    return { sent: false, reason: orderError?.message ?? "Order not found" };
  }

  if (!order.email) {
    console.warn(`[mail] Order ${orderId} has no email on file — skipping shipped notice.`);
    return { sent: false, reason: "No email on order" };
  }

  // Idempotency guard — fulfill can be called more than once for the same
  // order (e.g. adding tracking after an initial fulfill), don't re-spam.
  if (order.shipped_email_sent_at) {
    return { sent: false, reason: "Shipped email already sent" };
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("product_title, variant_title, quantity, sku")
    .eq("order_id", orderId);

  if (itemsError) {
    console.error("[mail] Could not load order items for shipped email:", itemsError.message);
  }

  const palette = await resolveEmailPalette((order as any).theme_id);

  const { subject, html, text } = renderOrderShippedEmail(
    order as ShippedOrderForEmail,
    (items ?? []) as ShippedItemForEmail[],
    trackingNumber,
    trackingUrl,
    palette
  );

  const isResearch = order.order_source === "research";
  const identity = getMailIdentity(isResearch ? "labs" : "support");

  const result = await sendMail({
    to: order.email,
    from: formatFrom(identity),
    replyTo: identity.mailbox,
    subject,
    html,
    text,
    credentials: identity.credentials,
    order_id: order.id,
  });

  if (result.sent) {
    await admin
      .from("orders")
      .update({ shipped_email_sent_at: new Date().toISOString() })
      .eq("id", orderId);
  }

  return result;
}
