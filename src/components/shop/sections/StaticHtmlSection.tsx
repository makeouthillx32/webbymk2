// components/shop/sections/StaticHtmlSection.tsx
"use client";

import type { SectionComponentProps } from "./SectionRegistry";
import { ClientInlineStaticPage } from "@/components/shop/_components/ClientInlineStaticPage";

export default function StaticHtmlSection({ section }: SectionComponentProps) {
  const slug = String(section.config?.slug ?? "").trim();
  if (!slug) return null;

  return (
    <ClientInlineStaticPage 
      slug={slug}
      compact={true}
      showFooter={false}
    />
  );
}