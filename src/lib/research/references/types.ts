// lib/research/references/types.ts
// Shared type for the "Sources & References" component (src/components/research/SourcesReferences.tsx).
// Not wired into any page yet — parked here so reference lists for other
// compounds can be added the same way once this gets a home.
//
// Data lives in the `research_references` DB table (group_key column),
// never in per-product-named files — see ./queries.ts for the fetch.

export type ResearchReference = {
  /** DB row id (uuid) */
  id: string;
  /** Journal / source name, shown as the small uppercase eyebrow label */
  journal: string;
  title: string;
  year: number;
  /** Free-text author list, e.g. "Pickart L, Margolina A" */
  authors?: string;
  /** PubMed ID — shown as a badge, and used to build the PubMed link if no explicit url is given */
  pmid?: string;
  /** DOI (without the https://doi.org/ prefix) — shown as a badge, and used to build the link if no explicit url is given */
  doi?: string;
  /**
   * Explicit "View Source" link. If omitted, one is derived from pmid or doi
   * when present. If none of the three are set, "View Source" is not shown —
   * never fabricate a link for a source with no identifier.
   */
  url?: string;
};

/** Resolves the link to show for "View Source" — explicit url wins, else derived from pmid/doi, else undefined. */
export function resolveReferenceUrl(ref: ResearchReference): string | undefined {
  if (ref.url) return ref.url;
  if (ref.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/`;
  if (ref.doi) return `https://doi.org/${ref.doi}`;
  return undefined;
}
