// settings/landing/_components/CreateLandingSectionModal.tsx
"use client";

import React from "react";
import LandingSectionModal from "./LandingSectionModal";
import type { LandingSectionRow } from "./types";
import "./landing.scss";

export default function CreateLandingSectionModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const blank: LandingSectionRow = {
    id: "",
    position: 1,
    type: "static_html",
    is_active: true,
    config: { slug: "" },
  };

  return (
    <LandingSectionModal
      open={open}
      section={blank}
      isCreate
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}