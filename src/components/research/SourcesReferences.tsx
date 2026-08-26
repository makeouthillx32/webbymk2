// components/research/SourcesReferences.tsx
//
// "Sources & References" card — lists the peer-reviewed / cited sources
// behind a research compound's claims (PMID, DOI, authors, "View Source").
//
// PARKED — not wired into any page yet. Built and registered here as a
// reusable piece so it's ready to drop in once a home is picked (most likely
// candidate: the research product detail page, alongside the existing
// "Product Details" / "Certificate of Analysis" sections in
// src/components/research/ResearchProductDetailClient.tsx — see that file's
// "── Product Details ──" block around line 430 for the matching card style
// this was built to blend with).
//
// Data lives in the `research_references` DB table (group_key column) —
// never hardcoded per-product files. Usage once you're ready to connect it,
// from a server component that already has a Supabase client:
//   import { SourcesReferences } from "@/components/research/SourcesReferences";
//   import { getResearchReferences } from "@/lib/research/references/queries";
//   const refs = await getResearchReferences(supabase, "ghk-cu");
//   <SourcesReferences references={refs} />
//
// To add a new compound's reference list: insert rows into
// research_references with a new group_key value (e.g. "bpc-157") — no code
// changes needed. See vault or ask for the insert-rows pattern used to seed
// the initial GHK-Cu rows.

import { ExternalLink } from "lucide-react";
import type { ResearchReference } from "@/lib/research/references/types";
import { resolveReferenceUrl } from "@/lib/research/references/types";

export function SourcesReferences({
  references,
  title = "Sources & References",
}: {
  references: ResearchReference[];
  title?: string;
}) {
  if (references.length === 0) return null;

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] p-4">
      <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
        <span aria-hidden>📚</span> {title}
      </h2>

      <p className="text-xs text-[var(--muted-foreground)] mb-4">
        Peer-reviewed research and other cited sources referenced on this page. Provided for
        research context only — see the product listing for research-use disclaimers.
      </p>

      <div className="space-y-3">
        {references.map((ref) => {
          const url = resolveReferenceUrl(ref);
          return (
            <div
              key={ref.id}
              className="rounded-lg border border-[var(--border)] p-3 hover:border-[hsl(var(--primary)/0.4)] transition-colors"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--primary))]">
                {ref.journal}
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug">{ref.title}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
                <span>{ref.year}</span>
                {ref.pmid && (
                  <>
                    <span aria-hidden>•</span>
                    <span className="font-mono">PMID: {ref.pmid}</span>
                  </>
                )}
                {ref.doi && (
                  <>
                    <span aria-hidden>•</span>
                    <span className="font-mono">DOI: {ref.doi}</span>
                  </>
                )}
                {ref.authors && (
                  <>
                    <span aria-hidden>•</span>
                    <span>{ref.authors}</span>
                  </>
                )}
              </div>

              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--primary))] hover:opacity-80"
                >
                  View Source <ExternalLink size={11} />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
