// app/verify/page.tsx
//
// labs.unenter.live/verify — site-wide COA / Lab Results library. Every
// batch, every product, one searchable index (product dropdown + batch/lot
// search), modeled on the competitor page the user pointed at
// (ionpeptide.com/lab-results/). Complements the existing per-product
// library at /verify/product/<slug> and the QR-code entry point at
// /verify/<access_code> — this is the page a "Browse All Lab Results"
// button on the labs landing page links to.

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { createServerClient } from "@/utils/supabase/server";
import { getZoneContext } from "@/lib/zoneContext";
import { getLabResultsLibrary } from "@/lib/research/queries";
import CoaLibraryClient from "@/components/research/CoaLibraryClient";

export const metadata = {
  title: "Certificate of Analysis Library | Unenter Labs",
  description:
    "Search every third-party lab report on file for Unenter Labs research compounds by product or batch number.",
};

export const revalidate = 300;

export default async function CoaLibraryPage() {
  const zoneCtx = await getZoneContext();
  if (zoneCtx.zone !== "labs") {
    notFound();
  }

  const supabase = await createServerClient();
  const products = await getLabResultsLibrary(supabase);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--primary))] mb-2">
        <ShieldCheck size={14} /> Full Transparency
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(var(--foreground))]">
        Certificate of Analysis Library
      </h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 max-w-2xl">
        Every batch we've sent for independent HPLC and mass-spec testing, across every compound we
        carry. Search by the batch or lot number printed on your vial, or browse by product.
      </p>

      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>}>
          <CoaLibraryClient products={products as any} />
        </Suspense>
      </div>

      <p className="mt-10 text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))] pt-4">
        For laboratory research use only. Not for human or animal consumption.
      </p>
    </main>
  );
}
