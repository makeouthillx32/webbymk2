// lib/mail/orderConfirmation.ts
// Renders the "your order is confirmed" receipt sent once Stripe payment
// succeeds (see the webhook wiring in app/api/webhooks/stripe/route.ts).
// Research-chemical orders (order_source === 'research') get the Unenter
// Labs research-use disclaimer appended; regular shop orders don't.
//
// Visually themed: colors come from the customer's own site theme (captured
// as orders.theme_id at checkout, resolved to hex via lib/mail/theme.ts) so
// the email doesn't look like a bare system notice — see EmailPalette.

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

export type OrderForEmail = {
  id: string;
  order_number: string;
  created_at?: string | null;
  email: string;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  promo_code?: string | null;
  shipping_method_name?: string | null;
  order_source?: string | null;
  shipping_address?: EmailAddress;
  billing_address?: EmailAddress;
  payment_method_brand?: string | null;
  payment_method_last4?: string | null;
};

export type OrderItemForEmail = {
  product_title: string;
  variant_title?: string | null;
  quantity: number;
  price_cents: number;
  imageUrl?: string | null;
};

function money(cents: number) {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

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

function paymentMethodLabel(order: OrderForEmail) {
  if (order.payment_method_brand && order.payment_method_last4) {
    return `${order.payment_method_brand.toUpperCase()} ending in ${order.payment_method_last4}`;
  }
  return "Card";
}

const RESEARCH_DISCLAIMER = `
  The statements made here have not been evaluated by the Food and Drug Administration.
  These products are not intended to diagnose, treat, cure, or prevent any disease. Unenter
  Labs compounds are sold exclusively for in-vitro laboratory and research purposes — they
  are not for human or animal use of any kind, and must be handled only by individuals with
  appropriate professional training. These items are not drugs, foods, cosmetics, or medical
  devices, and must not be represented or used as such. By completing this purchase you
  confirm you understand and accept our full
  <a href="https://www.unenter.live/research-disclaimer" style="color:#6b7280;">research use disclaimer</a>.
`;

export function renderOrderConfirmationEmail(
  order: OrderForEmail,
  items: OrderItemForEmail[],
  palette: EmailPalette
) {
  const isResearch = order.order_source === "research";
  const brandName = isResearch ? "Unenter Labs" : "unenter.live";
  const firstName = order.customer_first_name || "there";
  const savedCents = order.discount_cents ?? 0;
  const supportEmail = isResearch ? "labs@unenter.live" : "support@unenter.live";

  const subject = `Your ${brandName} order #${order.order_number} is confirmed`;

  const orderDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

  const itemsRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:14px 12px 14px 0;border-bottom:1px solid ${palette.border};" width="52">
          ${
            item.imageUrl
              ? `<img src="${item.imageUrl}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:6px;object-fit:cover;border:1px solid ${palette.border};">`
              : `<div style="width:44px;height:44px;border-radius:6px;background:#f4f4f4;border:1px solid ${palette.border};"></div>`
          }
        </td>
        <td style="padding:14px 12px;border-bottom:1px solid ${palette.border};font-size:14px;color:${palette.foreground};">
          ${item.product_title}${item.variant_title ? ` <span style="color:${palette.mutedForeground};">(${item.variant_title})</span>` : ""}
        </td>
        <td style="padding:14px 12px;border-bottom:1px solid ${palette.border};text-align:center;font-size:14px;color:${palette.foreground};">×${item.quantity}</td>
        <td style="padding:14px 0;border-bottom:1px solid ${palette.border};text-align:right;font-size:14px;color:${palette.foreground};">${money(item.price_cents * item.quantity)}</td>
      </tr>`
    )
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#ffffff;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;color:${palette.foreground};">

    <table style="width:100%;margin-bottom:24px;">
      <tr><td>
        <span style="font-size:16px;font-weight:700;letter-spacing:0.02em;color:${palette.primary};">${brandName}</span>
      </td></tr>
    </table>

    <h2 style="margin:0 0 4px;font-size:22px;color:${palette.foreground};">Thank you for your order</h2>
    <p style="color:${palette.mutedForeground};margin:0 0 4px;font-size:14px;">Hi ${firstName},</p>
    <p style="color:${palette.mutedForeground};margin:0 0 24px;font-size:14px;">We've received your order and it's now being processed. Here's a summary of what you ordered:</p>

    <h3 style="margin:0 0 2px;font-size:16px;color:${palette.foreground};">Order summary</h3>
    <p style="margin:0 0 16px;font-size:12px;color:${palette.mutedForeground};">Order #${order.order_number}${orderDate ? ` (${orderDate})` : ""}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <th colspan="2" style="text-align:left;padding:0 12px 8px 0;border-bottom:2px solid ${palette.foreground};font-size:12px;text-transform:uppercase;letter-spacing:0.03em;color:${palette.mutedForeground};">Product</th>
        <th style="text-align:center;padding:0 12px 8px;border-bottom:2px solid ${palette.foreground};font-size:12px;text-transform:uppercase;letter-spacing:0.03em;color:${palette.mutedForeground};">Qty</th>
        <th style="text-align:right;padding:0 0 8px;border-bottom:2px solid ${palette.foreground};font-size:12px;text-transform:uppercase;letter-spacing:0.03em;color:${palette.mutedForeground};">Price</th>
      </tr>
      ${itemsRows}
    </table>

    <table style="width:100%;font-size:14px;margin-bottom:24px;">
      <tr><td style="padding:3px 0;color:${palette.mutedForeground};">Subtotal:</td><td style="padding:3px 0;text-align:right;color:${palette.foreground};">${money(order.subtotal_cents)}</td></tr>
      ${savedCents > 0 ? `<tr><td style="padding:3px 0;color:${palette.mutedForeground};">Discount${order.promo_code ? ` (${order.promo_code})` : ""}:</td><td style="padding:3px 0;text-align:right;color:#16a34a;">-${money(savedCents)}</td></tr>` : ""}
      <tr><td style="padding:3px 0;color:${palette.mutedForeground};">Shipping${order.shipping_method_name ? ` (${order.shipping_method_name})` : ""}:</td><td style="padding:3px 0;text-align:right;color:${palette.foreground};">${money(order.shipping_cents)}</td></tr>
      ${order.tax_cents > 0 ? `<tr><td style="padding:3px 0;color:${palette.mutedForeground};">Tax:</td><td style="padding:3px 0;text-align:right;color:${palette.foreground};">${money(order.tax_cents)}</td></tr>` : ""}
      <tr><td style="padding:8px 0 0;font-weight:700;border-top:1px solid ${palette.border};color:${palette.foreground};">Total:</td><td style="padding:8px 0 0;text-align:right;font-weight:700;border-top:1px solid ${palette.border};color:${palette.foreground};">${money(order.total_cents)}</td></tr>
      <tr><td style="padding-top:6px;color:${palette.mutedForeground};">Payment method:</td><td style="padding-top:6px;text-align:right;color:${palette.foreground};">${paymentMethodLabel(order)}</td></tr>
    </table>

    <table style="width:100%;border-top:1px solid ${palette.border};padding-top:16px;font-size:13px;margin-bottom:24px;">
      <tr>
        <td style="width:50%;vertical-align:top;padding-top:16px;">
          <p style="color:${palette.foreground};font-weight:700;margin:0 0 4px;">Billing address</p>
          <span style="color:${palette.mutedForeground};">${formatAddress(order.billing_address ?? order.shipping_address, `${order.customer_first_name ?? ""} ${order.customer_last_name ?? ""}`.trim())}</span>
        </td>
        <td style="width:50%;vertical-align:top;padding-top:16px;">
          <p style="color:${palette.foreground};font-weight:700;margin:0 0 4px;">Shipping address</p>
          <span style="color:${palette.mutedForeground};">${formatAddress(order.shipping_address, `${order.customer_first_name ?? ""} ${order.customer_last_name ?? ""}`.trim())}</span>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:13px;color:${palette.mutedForeground};">
      Thanks again! If you need any help with your order, please contact us at
      <a href="mailto:${supportEmail}" style="color:${palette.primary};">${supportEmail}</a>.
    </p>

    ${isResearch ? `<p style="margin:0 0 20px;font-size:11px;line-height:1.6;color:${palette.mutedForeground};">${RESEARCH_DISCLAIMER}</p>` : ""}

    <table style="width:100%;border-top:1px solid ${palette.border};padding-top:16px;font-size:12px;color:${palette.mutedForeground};">
      <tr><td style="padding-top:16px;">
        <strong style="color:${palette.foreground};">${brandName}</strong>
      </td></tr>
    </table>
  </div>
  </div>`;

  const text = [
    `Thank you for your order`,
    ``,
    `Hi ${firstName},`,
    `We've received your order and it's now being processed.`,
    ``,
    `Order number: ${order.order_number}`,
    `Payment method: ${paymentMethodLabel(order)}`,
    `Total: ${money(order.total_cents)}`,
    savedCents > 0 ? `You saved ${money(savedCents)}` : "",
    ``,
    `Order details:`,
    ...items.map((i) => `  ${i.product_title}${i.variant_title ? ` (${i.variant_title})` : ""} x${i.quantity} — ${money(i.price_cents * i.quantity)}`),
    ``,
    `Subtotal: ${money(order.subtotal_cents)}`,
    savedCents > 0 ? `Discount: -${money(savedCents)}` : "",
    `Shipping: ${money(order.shipping_cents)}`,
    order.tax_cents > 0 ? `Tax: ${money(order.tax_cents)}` : "",
    `Total: ${money(order.total_cents)}`,
    ``,
    `Questions? Contact ${isResearch ? "labs@unenter.live" : "support@unenter.live"}`,
    isResearch ? `\nFor research/laboratory use only. See https://www.unenter.live/research-disclaimer` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
