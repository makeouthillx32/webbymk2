// lib/mail/backInStock.ts
// Sent when a research-compound variant a shopper was watching goes from
// zero stock back to available. Uses the "labs" mail identity (Unenter
// Labs), matching research order confirmations. Themed off the signup's
// own site theme (research_stock_notifications.theme_id).
import type { EmailPalette } from "./theme";

export function renderBackInStockEmail(params: {
  productTitle: string;
  variantTitle?: string | null;
  productUrl: string;
  imageUrl?: string | null;
  palette: EmailPalette;
}) {
  const { productTitle, variantTitle, productUrl, imageUrl, palette } = params;
  const fullTitle = variantTitle && variantTitle !== "Default" ? `${productTitle} (${variantTitle})` : productTitle;

  const subject = `Back in stock: ${fullTitle}`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:${palette.background};padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;color:${palette.foreground};text-align:center;">

    <table style="width:100%;margin-bottom:24px;">
      <tr><td style="text-align:center;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${palette.primary};margin-right:8px;vertical-align:middle;"></span>
        <span style="font-size:15px;font-weight:700;letter-spacing:0.02em;vertical-align:middle;color:${palette.foreground};">UNENTER LABS</span>
      </td></tr>
    </table>

    <div style="background:${palette.card};border:1px solid ${palette.border};border-radius:12px;padding:32px;">
      <h2 style="margin:0 0 4px;font-size:22px;color:${palette.foreground};">It's back.</h2>
      <p style="color:${palette.mutedForeground};margin:0 0 20px;">${fullTitle} is back in stock at Unenter Labs.</p>

      ${
        imageUrl
          ? `<img src="${imageUrl}" width="220" alt="${fullTitle}" style="display:block;max-width:220px;width:100%;height:auto;border-radius:10px;margin:0 auto 20px;border:1px solid ${palette.border};">`
          : ""
      }

      <p style="font-weight:700;font-size:16px;margin:0 0 20px;color:${palette.foreground};">${fullTitle}</p>

      <a href="${productUrl}" style="display:inline-block;background:${palette.primary};color:${palette.primaryForeground};padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        View product
      </a>
    </div>

    <p style="margin-top:24px;font-size:11px;line-height:1.6;color:${palette.mutedForeground};">
      Sold exclusively for laboratory research use. Not for human or animal use.
      You're receiving this because you asked to be notified when this item restocked.
    </p>
  </div>
  </div>`;

  const text = [
    `It's back.`,
    ``,
    `${fullTitle} is back in stock at Unenter Labs.`,
    ``,
    `View it here: ${productUrl}`,
    ``,
    `For laboratory research use only. You're receiving this because you asked to be notified when this item restocked.`,
  ].join("\n");

  return { subject, html, text };
}
