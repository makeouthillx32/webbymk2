"use client";

import React from "react";
import { ShowcaseSection } from "@/components/Layouts/dashboard/sidebar/showcase-section";
import LimsManagementPanel from "../research-products/_components/accu-mk1/LimsManagementPanel";

export default function LimsPage() {
  return (
    <ShowcaseSection title="LIMS & Peptide Testing Engine">
      <LimsManagementPanel />
    </ShowcaseSection>
  );
}
