"use client";
// src/zones/blog/_components/NewsletterBand.tsx
// "Stay in the Loop" signup band (GitButler-style).
// POSTs to /api/newsletter/subscribe on the CORE domain (absolute URL, not
// relative) — the blog zone's deployed image doesn't bundle /api routes, so
// a same-origin request would 404. The route sends CORS headers back for
// this cross-origin call. Stores the signup and sends a welcome email
// through our own poste.io SMTP relay (src/lib/mail) — no third-party ESP.

import { useState } from "react";

const NEWSLETTER_ENDPOINT = "https://www.unenter.live/api/newsletter/subscribe";

export interface NewsletterBandProps {
  enabled?: boolean;
  heading?: string;
  body?:    string;
  success?: string;
}

export default function NewsletterBand({
  enabled = true,
  heading = "Stay in the Loop",
  body    = "Subscribe to get fresh updates, insights, and exclusive content delivered straight to your inbox. No spam, just great reads.",
  success = "Thanks — you are on the list.",
}: NewsletterBandProps) {
  const [email, setEmail]         = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  if (!enabled) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(NEWSLETTER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "blog_band" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error?.message || "Something went wrong — try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-[hsl(var(--accent))] py-14 text-[hsl(var(--accent-foreground))] md:py-20">
      <div className="container">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-serif text-3xl md:text-5xl">
            {heading.includes(" ") ? (
              <>
                {heading.slice(0, heading.lastIndexOf(" "))}{" "}
                <em className="italic">{heading.slice(heading.lastIndexOf(" ") + 1)}</em>
              </>
            ) : (
              heading
            )}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed opacity-80">{body}</p>

          {submitted ? (
            <p className="mt-10 font-serif text-2xl">{success}</p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-10 flex items-end gap-6">
              <label className="block grow">
                <span className="sr-only">Email address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  disabled={submitting}
                  className="w-full border-0 border-b-2 border-current bg-transparent pb-3 font-serif text-2xl placeholder-[hsl(var(--accent-foreground))] placeholder-opacity-50 outline-none focus:ring-0 md:text-3xl disabled:opacity-60"
                />
                {error && <span className="mt-2 block text-sm opacity-80">{error}</span>}
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="group flex shrink-0 flex-col items-center gap-1 pb-1 text-sm font-medium opacity-90 transition hover:opacity-100 disabled:opacity-50"
                aria-label="Subscribe"
              >
                <svg
                  width="40" height="24" viewBox="0 0 40 24" fill="none"
                  stroke="currentColor" strokeWidth="2"
                  className="transition-transform group-hover:translate-x-1"
                  aria-hidden
                >
                  <path d="M2 12h34M28 4l8 8-8 8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {submitting ? "Subscribing…" : "Subscribe"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
