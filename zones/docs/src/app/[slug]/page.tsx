// zones/docs/src/app/[slug]/page.tsx
// Docs zone · docs.unenter.live/<slug>
// Renders any markdown file from src/zones/docs/content/ as a page.
// Drop a new .md file there → new page, statically generated at build.
export {
  default,
  generateStaticParams,
  generateMetadata,
} from "@/zones/docs/DocPage";
