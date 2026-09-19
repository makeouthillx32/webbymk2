"use client";

// src/zones/tank/public/components/SeasonPassOverlay/TankEmbeddedCheckout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Paying for a pass without leaving Tank.
//
// The previous flow did window.location.assign(session.url), which threw the
// viewer out of the house onto a Stripe-hosted page: the stream stopped, the
// room they were watching was lost, and they came back on a query string. For
// a site whose whole proposition is a live feed you stay inside, that is the
// wrong shape.
//
// Stripe's Embedded Checkout mounts the same hardened, PCI-scoped form in an
// iframe inside this overlay. Card data never touches Tank — which is exactly
// why this is the right call for "ready for real load" rather than a
// hand-rolled Elements form that would put us in scope for handling it.
//
// The chrome around the iframe is Tank's; the payment form inside it is
// Stripe's. That seam is deliberate and worth keeping.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { useStripeLane } from "@/lib/stripe/useStripeLane";

const ASSETS =
  "https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images";
const METAL = `${ASSETS}/metal-small-comp.webp`;

export function TankEmbeddedCheckout({
  clientSecret,
  title,
  onClose,
}: {
  clientSecret: string;
  title: string;
  onClose: () => void;
}) {
  const lane = useStripeLane("tank");
  const [mounted, setMounted] = useState(false);

  // The iframe takes a moment to paint. Without this the panel shows an empty
  // black box first, which reads as a broken checkout at exactly the moment a
  // viewer is deciding whether to trust it with a card.
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 250);
    return () => clearTimeout(timer);
  }, []);

  if (lane.error) {
    return (
      <div className="rounded border border-red-500/40 bg-red-950/40 p-4 text-center">
        <p className="text-xs font-bold text-red-300">{lane.error}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 rounded border border-white/15 px-3 py-1.5 text-[11px] font-black uppercase text-slate-200"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden border border-black/80"
      style={{
        borderRadius: 6,
        backgroundColor: "#141416",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 30px rgba(0,0,0,0.7)",
      }}
    >
      <div
        className="flex items-center justify-between border-b border-black/80 px-4 py-2.5"
        style={{
          backgroundColor: "#2b2f33",
          backgroundImage: `url('${METAL}')`,
          backgroundRepeat: "repeat",
        }}
      >
        <span
          className="text-xs font-black uppercase tracking-[0.16em] text-white"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close checkout"
          className="rounded p-1 text-slate-300 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-[420px] bg-white">
        {lane.stripe && mounted ? (
          <EmbeddedCheckoutProvider
            stripe={lane.stripe}
            options={{ clientSecret }}
            // Keyed on the secret so re-opening checkout for a different tier
            // mounts a fresh session rather than reusing the previous one.
            key={clientSecret}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-[#141416]">
            <Loader2 className="h-7 w-7 animate-spin text-[#ff4d00]" />
            <p className="text-xs text-slate-400">Opening secure checkout…</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-black/80 bg-[#0a0a0b] px-4 py-2">
        <ShieldCheck className="h-3 w-3 text-emerald-400" />
        <span className="text-[10px] text-slate-400">
          Payment handled by Stripe. Tank never sees your card details.
        </span>
        {lane.mode === "test" ? (
          // Only ever shown in test mode, and derived — never hardcoded. A real
          // customer must never be told their charge is not real.
          <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-300">
            Test mode
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default TankEmbeddedCheckout;
