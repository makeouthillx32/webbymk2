// settings/landing/_components/LandingActionBar.tsx
"use client";

import React, { useState } from "react";
import CreateLandingSectionModal from "./CreateLandingSectionModal";

export default function LandingActionBar({ onRefresh }: { onRefresh: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="actionbar">
      <div className="actionbar-left">
        <button className="btn" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <div className="actionbar-right">
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          Add Section
        </button>
      </div>

      <CreateLandingSectionModal
        open={open}
        onOpenChange={(v) => setOpen(v)}
        onSaved={onRefresh}
      />
    </div>
  );
}
