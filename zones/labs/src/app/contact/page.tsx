// zones/labs/src/app/contact/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unenter Labs zone · labs.unenter.live/contact · entry wrapper
//
// Thin re-export, same idiom as this zone's account page — the real content lives
// in the core tree so it can import shared components, theme tokens and utils:
//   → src/zones/labs/contact/ContactPage.tsx
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import ContactPage from "@/zones/labs/contact/ContactPage";

export const metadata: Metadata = {
  title: "Contact Support & Inquiries | Unenter Labs",
  description:
    "Contact Unenter Labs customer care, in-vitro laboratory order support, analytical batch verification, and institutional inquiries.",
};

export default function Page() {
  return <ContactPage />;
}
