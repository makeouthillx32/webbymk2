// lib/mail/newsletterWelcome.ts
// Welcome email sent the moment someone submits the blog "Stay in the Loop"
// band. Same visual language as orderConfirmation.ts's template — themed
// off the subscriber's own site theme (newsletter_subscribers.theme_id).
import type { EmailPalette } from "./theme";

export function renderNewsletterWelcomeEmail(email: string, palette: EmailPalette) {
  const subject = "You're on the list — welcome to unenter.live";

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:${palette.background};padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;color:${palette.foreground};">

    <table style="width:100%;margin-bottom:24px;">
      <tr><td>
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${palette.primary};margin-right:8px;vertical-align:middle;"></span>
        <span style="font-size:15px;font-weight:700;letter-spacing:0.02em;vertical-align:middle;color:${palette.foreground};">UNENTER.LIVE</span>
      </td></tr>
    </table>

    <div style="background:${palette.card};border:1px solid ${palette.border};border-radius:12px;padding:32px;">
      <h2 style="margin:0 0 8px;font-size:22px;color:${palette.foreground};">You're in.</h2>
      <p style="color:${palette.mutedForeground};margin:0;">Thanks for subscribing — you'll get fresh updates, insights, and posts from unenter.live straight to your inbox. No spam, just great reads.</p>

      <p style="margin-top:24px;">
        <a href="https://blog.unenter.live" style="display:inline-block;background:${palette.primary};color:${palette.primaryForeground};padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Read the latest posts →</a>
      </p>
    </div>

    <p style="margin-top:24px;font-size:12px;color:${palette.mutedForeground};">
      You're receiving this because ${email} signed up at unenter.live. Didn't sign up? Just ignore this email.
    </p>
  </div>
  </div>`;

  const text = [
    `You're in.`,
    ``,
    `Thanks for subscribing — you'll get fresh updates, insights, and posts from unenter.live straight to your inbox. No spam, just great reads.`,
    ``,
    `Latest posts: https://blog.unenter.live`,
    ``,
    `You're receiving this because ${email} signed up at unenter.live. Didn't sign up? Just ignore this email.`,
  ].join("\n");

  return { subject, html, text };
}
