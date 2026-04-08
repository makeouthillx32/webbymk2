// components/shop/sections/TopBannerSection.tsx
import type { SectionComponentProps } from "./SectionRegistry";
import { TopBanner } from "@/components/shop/_components/TopBanner";

export default function TopBannerSection({ section }: SectionComponentProps) {
  // config currently optional; you can use it later
  return <TopBanner {...(section.config ?? {})} />;
}