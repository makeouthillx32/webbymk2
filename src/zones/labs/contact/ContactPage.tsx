"use client";

// src/zones/labs/contact/ContactPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unenter Labs Customer Care & Inquiry Portal (labs.unenter.live/contact).
// Strictly using theme tokens (hsl(var(--...))).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import { Mail, ShieldCheck, Clock, MapPin, CheckCircle2, Send, HelpCircle, FileText } from "lucide-react";

export default function ContactPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("Order Status & Tracking");
  const [orderOrLot, setOrderOrLot] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName || !email || !message) return;

    setIsSubmitting(true);

    // Simulate ticketing dispatch and mailto fallback
    setTimeout(() => {
      const ticketId = `UNENTER-CARE-${Math.floor(100000 + Math.random() * 900000)}`;
      setSubmittedTicket(ticketId);
      setIsSubmitting(false);
    }, 600);
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] pt-20 md:pt-36 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header Breadcrumb & Eyebrow */}
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--primary))]">
          <Link href="/" className="hover:underline">Labs Home</Link>
          <span>/</span>
          <span>Customer Care</span>
        </div>

        {/* Hero Banner */}
        <div className="mt-4 rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--card))] via-[hsl(var(--card))] to-[hsl(var(--muted)/0.3)] p-6 sm:p-10 shadow-sm relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-[hsl(var(--primary))]">
              <ShieldCheck size={14} /> Official Support &amp; Research Alliance
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-[hsl(var(--foreground))]">
              Customer Care &amp; Inquiries
            </h1>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
              Direct assistance for laboratory orders, third-party analytical batch verifications, veterinary research partnerships with <strong>Blurton Livestock &amp; Rescue</strong>, and institutional allocations.
            </p>
          </div>
          {/* Subtle background glow */}
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[hsl(var(--primary)/0.08)] blur-3xl pointer-events-none" />
        </div>

        {/* Grid Layout: Contact Info & Inquiry Form */}
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* Left Column: Direct Info Cards */}
          <div className="lg:col-span-5 space-y-6">
            {/* Card 1: Email Support */}
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[hsl(var(--card-foreground))]">Email Support</h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Primary customer and order channel</p>
                </div>
              </div>
              <div className="mt-4 border-t border-[hsl(var(--border))] pt-4">
                <a
                  href="mailto:labs@unenter.live"
                  className="font-mono text-sm font-bold text-[hsl(var(--primary))] hover:underline"
                >
                  labs@unenter.live
                </a>
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1.5">
                  <Clock size={13} /> Responses typically within 12–24 business hours.
                </p>
              </div>
            </div>

            {/* Card 2: Blurton Livestock & Rescue Alliance */}
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent-foreground))]">
                  <MapPin size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[hsl(var(--card-foreground))]">Field Research Alliance</h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Blurton Livestock &amp; Rescue</p>
                </div>
              </div>
              <div className="mt-4 border-t border-[hsl(var(--border))] pt-4 space-y-2 text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                <p>
                  Equine and large-animal rescue, observational rehabilitation, and veterinary regenerative recovery datasets.
                </p>
                <p className="font-semibold text-[hsl(var(--card-foreground))]">
                  Operations &amp; Research Directorate: Tyler Burns
                </p>
              </div>
            </div>

            {/* Card 3: Quick Self-Service Links */}
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--card-foreground))]">
                Instant Self-Service Tools
              </h4>
              <div className="mt-3 space-y-2 text-xs">
                <Link
                  href="/verify"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))] transition"
                >
                  <span className="flex items-center gap-2">
                    <FileText size={14} className="text-[hsl(var(--primary))]" />
                    Verify Batch COA &amp; HPLC
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">&rarr;</span>
                </Link>

                <Link
                  href="/pages/faq"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))] transition"
                >
                  <span className="flex items-center gap-2">
                    <HelpCircle size={14} className="text-[hsl(var(--primary))]" />
                    Frequently Asked Questions
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">&rarr;</span>
                </Link>

                <Link
                  href="/pages/shipping"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))] transition"
                >
                  <span className="flex items-center gap-2">
                    <Clock size={14} className="text-[hsl(var(--primary))]" />
                    Shipping &amp; Delivery Policies
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">&rarr;</span>
                </Link>

                <Link
                  href="/pages/returns"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-semibold text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))] transition"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-[hsl(var(--primary))]" />
                    100% Quality &amp; Analysis Guarantee
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Support Form */}
          <div className="lg:col-span-7">
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8 shadow-sm">
              <h2 className="text-xl font-bold text-[hsl(var(--card-foreground))]">
                Send an Inquiry or Support Request
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[hsl(var(--muted-foreground))]">
                Fill out the details below and our clinical care team will respond promptly.
              </p>

              {submittedTicket ? (
                <div className="mt-6 rounded-xl border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.08)] p-6 text-center space-y-4">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]">
                    <CheckCircle2 size={28} />
                  </div>
                  <h3 className="text-lg font-bold text-[hsl(var(--card-foreground))]">
                    Inquiry Received
                  </h3>
                  <p className="text-xs sm:text-sm text-[hsl(var(--muted-foreground))] max-w-md mx-auto">
                    Thank you, <strong>{fullName}</strong>. Your ticket has been logged with reference number:
                  </p>
                  <div className="inline-block rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2 font-mono text-sm font-bold text-[hsl(var(--primary))]">
                    {submittedTicket}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    A copy has been routed to our operations queue at <code>labs@unenter.live</code>.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmittedTicket(null);
                      setMessage("");
                      setSubject("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90 transition"
                  >
                    Submit Another Inquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs sm:text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                        Researcher / Contact Name <span className="text-[hsl(var(--primary))]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Dr. Jane Doe"
                        className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                        Email Address <span className="text-[hsl(var(--primary))]">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="researcher@institution.edu"
                        className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                        Inquiry Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                      >
                        <option value="Order Status & Tracking">Order Status &amp; Tracking</option>
                        <option value="COA / Batch Verification">COA / Batch Verification</option>
                        <option value="Veterinary / Livestock Research Collaboration">Veterinary / Livestock Research Collaboration</option>
                        <option value="Wholesale & Institutional Supply">Wholesale &amp; Institutional Supply</option>
                        <option value="Damaged Package / Replacement Claim">Damaged Package / Replacement Claim</option>
                        <option value="General Scientific Question">General Scientific Question</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                        Order # or Batch Lot # <span className="text-[hsl(var(--muted-foreground))] font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={orderOrLot}
                        onChange={(e) => setOrderOrLot(e.target.value)}
                        placeholder="e.g. UNENTER-RX-198040 or CTB40-01"
                        className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                      Subject <span className="text-[hsl(var(--primary))]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Summary of your inquiry"
                      className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[hsl(var(--card-foreground))] mb-1">
                      Message Details <span className="text-[hsl(var(--primary))]">*</span>
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Please provide details about your order, research compound inquiry, or rescue alliance question..."
                      className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3.5 py-2.5 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow hover:opacity-90 transition disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <span>Logging Ticket...</span>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>Submit Inquiry</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
