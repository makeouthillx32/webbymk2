// app/research/page.tsx
//
// Superseded by root-level routing: labs.unenter.live/search now serves the
// full catalog (see app/search/page.tsx and app/[categorySlug]/page.tsx for
// individual products/categories). Kept as a redirect so any existing links
// to /research don't dead-end.

import { redirect } from "next/navigation";

export default function ResearchIndexRedirect() {
  redirect("/search");
}
