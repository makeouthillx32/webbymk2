// app/research/[slug]/page.tsx
//
// Superseded by the root-level [categorySlug] resolver (labs.unenter.live/<slug>).
// Kept as a redirect so any existing links to /research/<slug> don't dead-end.

import { redirect } from "next/navigation";

export default async function ResearchProductRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/${slug}`);
}
