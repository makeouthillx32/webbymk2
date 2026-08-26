// app/verify/[code]/page.tsx
//
// labs.unenter.live/verify/<access_code> — legacy/direct entry point for a
// single-batch QR code. Redirects into the full product lab-data library
// (/verify/product/<slug>?batch=<code>) so a scan lands on full
// transparency (every batch for the compound) while still deep-linking to
// and highlighting the exact batch that vial came from. Newly generated QR
// codes (see lab-data-tab.tsx) encode the /verify/product/... link
// directly; this route stays for any codes already printed before that.

import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/utils/supabase/server";
import { getZoneContext } from "@/lib/zoneContext";
import { getLabReportByAccessCode } from "@/lib/research/queries";

export default async function VerifyCodeRedirect({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const zoneCtx = await getZoneContext();
  if (zoneCtx.zone !== "labs") {
    notFound();
  }

  const supabase = await createServerClient();
  const report = await getLabReportByAccessCode(supabase, code);

  if (!report) {
    notFound();
  }

  redirect(`/verify/product/${report.product.slug}?batch=${code}`);
}
