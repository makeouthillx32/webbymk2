// components/home/_components/pageTree.ts
// NOTE: Keep SAME export names + structure.
// We’re stripping this down to only components that exist right now.

import HomePage from "@/components/shop/Landing";
import AboutUsPage from "@/components/shop/AboutUs";
import TermsPage from "@/components/shop/TermsPage";
import PrivacyPolicy from "@/components/shop/PrivacyPolicy";

export interface PageConfig {
  Component: React.FC<any>;
  backKey?: string;
  backLabel?: string;
  anchorId?: string;
}

export const pageTree: Record<string, PageConfig> = {
  // ✅ Landing
  home: { Component: HomePage, anchorId: "home" },

  // ✅ Keep keys for routing/nav stability, but point everything to existing pages
  shop: {
    Component: HomePage,
    backKey: "home",
    backLabel: "Back to Home",
    anchorId: "shop",
  },
   // ✅ Brand/info
  about: {
    Component: AboutUsPage,
    backKey: "home",
    backLabel: "Back to Home",
    anchorId: "about",
  },

  // ✅ Legal
  terms: {
    Component: TermsPage,
    backKey: "home",
    backLabel: "Back to Home",
    anchorId: "terms",
  },
  privacy: {
    Component: PrivacyPolicy,
    backKey: "home",
    backLabel: "Back to Home",
    anchorId: "privacy",
  },
};

export const sectionId: Record<string, string> = {
  home: "home",
  shop: "shop",
  terms: "terms",
  privacy: "privacy",
  about: "about",
};
