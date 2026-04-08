// settings/landing/_components/LoadingState.tsx
"use client";

import React from "react";

export default function LoadingState() {
  return (
    <div className="loading">
      <div className="loading-bar" />
      <div className="loading-text">Loading landing sections…</div>
    </div>
  );
}
