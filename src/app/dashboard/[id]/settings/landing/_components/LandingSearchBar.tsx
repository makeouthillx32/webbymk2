// settings/landing/_components/LandingSearchBar.tsx
"use client";

import React from "react";

export default function LandingSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="searchbar">
      <input
        className="search-input"
        placeholder="Search type / title / slug…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
