"use client";

// src/components/contact/GenericContactPage.tsx
// Zone-neutral contact form for every zone except Labs (which keeps its own
// richer, research-specific page at src/zones/labs/contact/ContactPage.tsx).
// Posts to the real /api/contact endpoint — see that route for what happens
// to a submission.

import { useState } from "react";
import { Mail, Clock, CheckCircle2, Send } from "lucide-react";
import type { MailBranch } from "@/lib/mail/identities";

export default function GenericContactPage({
  branch,
  mailboxAddress,
  siteName,
}: {
  branch: MailBranch;
  mailboxAddress: string;
  siteName: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !message) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, branch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Something went wrong sending your message. Please try again.");
        setIsSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong sending your message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] pt-20 md:pt-36 pb-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[hsl(var(--foreground))]">
          Contact {siteName}
        </h1>
        <p className="mt-3 text-sm sm:text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
          Questions, order issues, or anything else — send us a message and we'll get back to you.
        </p>

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
            <Mail size={20} />
          </div>
          <div>
            <a
              href={`mailto:${mailboxAddress}`}
              className="font-mono text-sm font-bold text-[hsl(var(--primary))] hover:underline"
            >
              {mailboxAddress}
            </a>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1.5">
              <Clock size={13} /> Responses typically within 12–24 business hours.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8 shadow-sm">
          {submitted ? (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]">
                <CheckCircle2 size={28} />
              </div>
              <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))]">Message sent</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Thanks, {name}. We've received your message at{" "}
                <code>{mailboxAddress}</code> and will reply to {email}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setName("");
                  setEmail("");
                  setSubject("");
                  setMessage("");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90 transition"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                    Name <span className="text-[hsl(var(--primary))]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                    Email <span className="text-[hsl(var(--primary))]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What's this about?"
                  className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                />
              </div>

              <div>
                <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                  Message <span className="text-[hsl(var(--primary))]">*</span>
                </label>
                <textarea
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                />
              </div>

              {error && (
                <p className="text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow hover:opacity-90 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Sending…</span>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
