// lib/mail/orderShipped.ts
// Renders the "your order has shipped" email, sent once an admin marks an
// order fulfilled with a tracking number (see app/api/orders/[id]/fulfill).
// Mirrors orderConfirmation.ts's structure/branding split — research-chemical
// orders (order_source === 'research') get the same disclaimer appended.
//
// Note: there was already a DB trigger (trg_shipment_notification_email ->
// notify_shipment_notification()) wired to fire on orders.status ->
// 'fulfilled', but it POSTs to a Supabase Edge Function on a hosted project
// (efglhzzageijqhfwvsub.supabase.co) that no longer resolves — dead since
// this app moved to the self-hosted stack. This module + sendOrderShipped.ts
// replace that with the same direct-app-code pattern already proven working
// for order confirmations (called from the webhook, not a DB trigger).

import type { EmailPalette } from "./theme";

export type EmailAddress = {
  firstName?: string | null;
  lastName?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null;

export type ShippedOrderForEmail = {
  id: string;
  order_number: string;
  email: string;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  order_source?: string | null;
  shipping_address?: EmailAddress;
  shipping_method_name?: string | null;
};

export type ShippedItemForEmail = {
  product_title: string;
  variant_title?: string | null;
  quantity: number;
  sku?: string | null;
  imageUrl?: string | null;
};

function formatAddress(addr: EmailAddress, name: string) {
  if (!addr) return name;
  const line2 = addr.address2 ? `${addr.address2}<br>` : "";
  return `
    ${name}<br>
    ${addr.address1 ?? ""}<br>
    ${line2}
    ${addr.city ?? ""}, ${addr.state ?? ""} ${addr.zip ?? ""}<br>
    United States (US)
  `;
}

const RESEARCH_DISCLAIMER = `
  The statements made here have not been evaluated by the Food and Drug Administration.
  These products are not intended to diagnose, treat, cure, or prevent any disease. Unenter
  Labs compounds are sold exclusively for in-vitro laboratory and research purposes — they
  are not for human or animal use of any kind, and must be handled only by individuals with
  appropriate professional training. These items are not drugs, foods, cosmetics, or medical
  devices, and must not be represented or used as such.
`;

// Plain, professional transactional layout (deliberately NOT the decorated
// card/CTA-button treatment used by promotional emails like backInStock.ts
// or newsletterWelcome.ts) — a shipping notice should read like a receipt,
// not an ad. Theme color is used sparingly: the wordmark and the tracking
// link, nothing else.
export function renderOrderShippedEmail(
  order: ShippedOrderForEmail,
  items: ShippedItemForEmail[],
  trackingNumber: string | null,
  trackingUrl: string | null,
  palette: EmailPalette
) {
  const isResearch = order.order_source === "research";
  const brandName = isResearch ? "Unenter Labs" : "unenter.live";
  const fullName = `${order.customer_first_name ?? ""} ${order.customer_last_name ?? ""}`.trim() || "there";
  const supportEmail = isResearch ? "labs@unenter.live" : "support@unenter.live";
  const siteUrl = isResearch ? "https://labs.unenter.live" : "https://www.unenter.live";

  const subject = `Your ${brandName} order #${order.order_number} has shipped`;

  const shippedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const itemsList = items
    .map((item) => `${item.product_title}${item.variant_title ? ` (${item.variant_title})` : ""} × ${item.quantity}`)
    .join(", ");

  const itemsRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px 10px 0;border-bottom:1px solid ${palette.border};font-size:13px;color:${palette.mutedForeground};vertical-align:top;">${item.sku ?? "—"}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${palette.border};font-size:14px;color:${palette.foreground};vertical-align:top;">
          ${item.product_title}${item.variant_title ? ` <span style="color:${palette.mutedForeground};">(${item.variant_title})</span>` : ""}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${palette.border};font-size:14px;color:${palette.foreground};text-align:right;vertical-align:top;">${item.quantity}</td>
      </tr>`
    )
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#ffffff;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;color:${palette.foreground};">

    <table style="width:100%;margin-bottom:28px;">
      <tr><td>
        <span style="font-size:16px;font-weight:700;letter-spacing:0.02em;color:${palette.primary};">${brandName}</span>
      </td></tr>
    </table>

    <p style="margin:0 0 16px;font-size:14px;">Dear ${fullName},</p>

    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">
      Thank you for your order from <strong>${brandName}</strong>! We wanted to let you know that your order
      (#${order.order_number}) was shipped${order.shipping_method_name ? ` via ${order.shipping_method_name}` : ""} on ${shippedDate}.
      You can track your package at any time using the link below.
    </p>

    <p style="margin:0 0 4px;font-size:13px;font-weight:700;">Shipped To:</p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:${palette.foreground};">
      ${formatAddress(order.shipping_address, fullName)}
    </p>

    ${
      trackingNumber
        ? `<p style="margin:0 0 4px;font-size:13px;font-weight:700;">Track Your Shipment:</p>
           <p style="margin:0 0 24px;font-size:13px;">
             ${trackingUrl ? `<a href="${trackingUrl}" style="color:${palette.primary};font-weight:600;">${trackingNumber}</a>` : trackingNumber}
           </p>`
        : `<p style="margin:0 0 24px;font-size:13px;color:${palette.mutedForeground};">Tracking will be added shortly — check back on this order for updates.</p>`
    }

    <p style="margin:0 0 8px;font-size:13px;color:${palette.mutedForeground};">This shipment includes the following items:</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <th style="text-align:left;padding:0 12px 8px 0;border-bottom:2px solid ${palette.foreground};font-size:12px;text-transform:uppercase;letter-spacing:0.03em;color:${palette.mutedForeground};">Item #</th>
        <th style="text-align:left;padding:0 12px 8px;border-bottom:2px solid ${palette.foreground};font-size:12px;text-transform:uppercase;letter-spacing:0.03em;color:${palette.mutedForeground};">Description</th>
        <th style="text-align:right;padding:0 0 8px;border-bottom:2px solid ${palette.foreground};font-size:12px;text-transform:uppercase;letter-spacing:0.03em;color:${palette.mutedForeground};">Qty</th>
      </tr>
      ${itemsRows}
    </table>

    <p style="margin:0 0 28px;font-size:14px;font-weight:600;">Thank you for your business and we look forward to serving you in the future!</p>

    <table style="width:100%;border-top:1px solid ${palette.border};padding-top:16px;font-size:12px;color:${palette.mutedForeground};">
      <tr><td style="padding-top:16px;">
        <strong style="color:${palette.foreground};">${brandName}</strong><br>
        Email: <a href="mailto:${supportEmail}" style="color:${palette.primary};">${supportEmail}</a><br>
        Website: <a href="${siteUrl}" style="color:${palette.primary};">${siteUrl.replace(/^https?:\/\//, "")}</a>
      </td></tr>
    </table>

    ${isResearch ? `<p style="margin-top:20px;font-size:11px;line-height:1.6;color:${palette.mutedForeground};">${RESEARCH_DISCLAIMER}</p>` : ""}
  </div>
  </div>`;

  const text = [
    `Dear ${fullName},`,
    ``,
    `Thank you for your order from ${brandName}! Your order (#${order.order_number}) was shipped${order.shipping_method_name ? ` via ${order.shipping_method_name}` : ""} on ${shippedDate}.`,
    ``,
    trackingNumber ? `Tracking number: ${trackingNumber}` : `Tracking will be added shortly.`,
    trackingUrl ? `Track: ${trackingUrl}` : "",
    ``,
    `This shipment includes: ${itemsList}`,
    ``,
    `Thank you for your business and we look forward to serving you in the future!`,
    ``,
    `${brandName}`,
    `Email: ${supportEmail}`,
    `Website: ${siteUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
