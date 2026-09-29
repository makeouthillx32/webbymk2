// src/app/contact/page.tsx
//
// Every zone's footer links here, but until 2026-09-24 this route always
// rendered Labs' contact page unconditionally — a shop or core visitor got
// "research peptides" / "Blurton Livestock & Rescue" copy and a form that
// (separately) never actually sent anything. Now zone-aware: Labs keeps its
// own richer page, everything else gets a zone-neutral form that posts to
// the real /api/contact endpoint.
import type { Metadata } from "next";
import { headers } from "next/headers";
import LabsContactPage from "@/zones/labs/contact/ContactPage";
import GenericContactPage from "@/components/Contact/GenericContactPage";
import { getMailIdentity, type MailBranch } from "@/lib/mail/identities";
import { getZoneContext } from "@/lib/zoneContext";

export const metadata: Metadata = {
  title: "Contact & Support",
  description: "Get in touch with the Unenter team.",
};

async function resolveZoneKey(): Promise<string> {
  const builtZone = process.env.NEXT_PUBLIC_ZONE?.trim();
  if (builtZone) return builtZone;
  try {
    const context = await getZoneContext();
    return context.zone || "unenter";
  } catch {
    return "unenter";
  }
}

const ZONE_BRANCHES: Record<string, MailBranch> = {
  shop: "shop",
  tank: "tank",
};

export default async function ContactPageRoute() {
  // headers() makes this render dynamic per-request rather than statically
  // prerendered once at build time — needed since the zone can come from the
  // request's host, not just the build-time NEXT_PUBLIC_ZONE.
  await headers();
  const zoneKey = await resolveZoneKey();

  if (zoneKey === "labs") {
    return <LabsContactPage />;
  }

  const branch = ZONE_BRANCHES[zoneKey] ?? "support";
  const identity = getMailIdentity(branch);

  return (
    <GenericContactPage
      branch={branch}
      mailboxAddress={identity.mailbox}
      siteName={identity.displayName}
    />
  );
}
