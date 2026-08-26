// components/Layouts/overlays/research-disclaimer/ResearchDisclaimerOverlay.tsx
//
// Blocking research-use / compliance gate for the Labs zone. Unlike the other
// zone overlays (cart, accessibility) this one is NOT dismissible by clicking
// outside or pressing Escape — it must obstruct the entire site until the
// visitor explicitly accepts or declines. Persisted via cookie so returning,
// already-accepted visitors don't see it again.
"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getCookie, setCookie } from "@/lib/cookieUtils";

const CONSENT_COOKIE_NAME = "labs_research_disclaimer_accepted_v1";
const CONSENT_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
const EXIT_URL = "https://unenter.live";

const DISCLAIMER_POINTS: string[] = [
  "The products listed on the Website are intended for laboratory research purposes only, and are not for human or animal consumption.",
  "The products listed on the Website are not intended to diagnose, treat, cure, or prevent any disease.",
  "The products listed on the Website should not be used as a food, drug, cosmetic, or for other household use.",
  "By accessing the Website, you acknowledge that it is your sole responsibility to ensure compliance with all applicable laws and regulations within your jurisdiction.",
  "Content on the Website is provided for informational purposes only and no information on the Website should be interpreted or construed as medical advice or guidance, healthcare recommendations, or scientific or laboratory guidance.",
];

interface AckState {
  readDisclaimer: boolean;
  age21: boolean;
  qualifiedResearcher: boolean;
  agreeTerms: boolean;
}

const EMPTY_ACK: AckState = {
  readDisclaimer: false,
  age21: false,
  qualifiedResearcher: false,
  agreeTerms: false,
};

const ALL_ACK: AckState = {
  readDisclaimer: true,
  age21: true,
  qualifiedResearcher: true,
  agreeTerms: true,
};

export default function ResearchDisclaimerOverlay() {
  // Default OPEN on both server and first client render so there is no flash
  // of unblocked content for a first-time visitor. An already-consented
  // returning visitor may see it for one frame before the effect closes it.
  const [open, setOpen] = React.useState(true);
  const [ack, setAck] = React.useState<AckState>(EMPTY_ACK);

  const allChecked = Object.values(ack).every(Boolean);

  React.useEffect(() => {
    try {
      if (getCookie(CONSENT_COOKIE_NAME) === "true") {
        setOpen(false);
      }
    } catch {
      // If cookies are unreadable, fail closed (keep the gate up).
    }
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const grantAccess = React.useCallback(() => {
    try {
      setCookie(CONSENT_COOKIE_NAME, "true", { maxAge: CONSENT_MAX_AGE });
    } catch {}
    setOpen(false);
  }, []);

  const handleAcceptAll = React.useCallback(() => {
    setAck(ALL_ACK);
    grantAccess();
  }, [grantAccess]);

  const handleSubmit = React.useCallback(() => {
    if (!allChecked) return;
    grantAccess();
  }, [allChecked, grantAccess]);

  const handleDecline = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = EXIT_URL;
    }
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-disclaimer-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 bg-destructive px-6 py-5 text-destructive-foreground">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 flex-shrink-0" aria-hidden="true" />
            <div>
              <h2 id="research-disclaimer-title" className="text-lg font-bold leading-tight">
                Research Use and Compliance Disclaimer
              </h2>
              <p className="mt-1 text-sm text-destructive-foreground/90">
                Please review and acknowledge before accessing the Website.
              </p>
            </div>
          </div>
          <Button
            onClick={handleAcceptAll}
            variant="secondary"
            size="sm"
            className="flex-shrink-0"
          >
            Accept All
          </Button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <p className="text-sm text-foreground">
            Before accessing or using the Website, all users must review, acknowledge, and agree to the following terms:
          </p>
          <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm text-foreground">
            {DISCLAIMER_POINTS.map((point, i) => (
              <li key={i} className="leading-relaxed">
                {point}
              </li>
            ))}
          </ol>

          <p className="mt-5 text-sm font-medium text-foreground">
            By continuing to access the Website, you confirm that you:
          </p>

          <div className="mt-3 space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50">
              <Checkbox
                checked={ack.readDisclaimer}
                onCheckedChange={(v) => setAck((s) => ({ ...s, readDisclaimer: v === true }))}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">
                I have read and understood the Research Use and Compliance Disclaimer above.
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50">
              <Checkbox
                checked={ack.age21}
                onCheckedChange={(v) => setAck((s) => ({ ...s, age21: v === true }))}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">I am at least 21 years of age.</span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50">
              <Checkbox
                checked={ack.qualifiedResearcher}
                onCheckedChange={(v) => setAck((s) => ({ ...s, qualifiedResearcher: v === true }))}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">I am a qualified researcher.</span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50">
              <Checkbox
                checked={ack.agreeTerms}
                onCheckedChange={(v) => setAck((s) => ({ ...s, agreeTerms: v === true }))}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">
                I agree that my access to the Website constitutes my acceptance of and consent to be bound by these full Terms.
              </span>
            </label>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            If you do not agree to these Terms, then you must exit the Website. Access to the Website is not permitted without your acceptance to these Terms.
          </p>

          <a
            href="/disclaimer"
            className="mt-3 inline-block text-xs font-medium text-primary underline underline-offset-4 hover:no-underline"
          >
            View full disclaimers
          </a>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-4">
          <Button onClick={handleDecline} variant="ghost" className="text-muted-foreground">
            Decline &amp; Exit
          </Button>
          <Button onClick={handleSubmit} disabled={!allChecked}>
            Submit &amp; Enter
          </Button>
        </div>
      </div>
    </div>
  );
}
