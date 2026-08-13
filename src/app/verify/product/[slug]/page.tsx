// app/verify/product/[slug]/page.tsx
//
// labs.unenter.live/verify/product/<slug> — full transparency batch/testing
// library for one product: every COA on file, across every variant/kit
// size, not just whichever one happens to be selected on the product page.
// A vial-label QR code links here (with ?batch=<access_code> to highlight
// the specific batch that vial came from) so a scan shows "here's your
// batch" AND "here's everything we've ever sent off for this compound."

import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck, FlaskConical } from "lucide-react";
import { createServerClient } from "@/utils/supabase/server";
import { getZoneContext } from "@/lib/zoneContext";
import { getLabReportLibraryForProduct } from "@/lib/research/queries";
import LabLibraryClient from "@/components/research/LabLibraryClient";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return {
    title: `Lab Data & Batch History | ${slug} | Unenter Labs`,
    description: "Full third-party testing history and batch library for this Unenter Labs research chemical.",
  };
}

export default async function ProductLabLibraryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const zoneCtx = await getZoneContext();
  if (zoneCtx.zone !== "labs") {
    notFound();
  }

  const supabase = await createServerClient();
  const library = await getLabReportLibraryForProduct(supabase, slug);

  if (!library) {
    notFound();
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--sidebar-primary)] mb-2">
        <ShieldCheck size={14} /> Full Transparency — Lab Data Library
      </div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FlaskConical size={22} />
        {library.product.title}
      </h1>
      <p className="text-sm text-[var(--muted-foreground)] mt-2 max-w-xl">
        Every third-party certificate of analysis we have on file for this compound — across every
        batch and every packaging option we've sold. Find your batch or lot number (printed on your
        vial or order receipt) in the list below.
      </p>

      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-[var(--muted-foreground)]">Loading…</p>}>
          <LabLibraryClient reports={library.reports as any} />
        </Suspense>
      </div>

      <p className="mt-10 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-4">
        For laboratory research use only. Not for human or animal consumption. Product page:{" "}
        <Link href={`/${library.product.slug}`} className="text-[var(--sidebar-primary)] hover:opacity-80">
          {library.product.title}
        </Link>
      </p>
    </main>
  );
}
