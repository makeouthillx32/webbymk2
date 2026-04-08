"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./map"), { ssr: false });

export function RegionLabels() {
  return (
    <div className="col-span-12 rounded-[calc(var(--radius)*1.25)] bg-[hsl(var(--card))] p-7.5 shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)] xl:col-span-7">
      <h2 className="mb-7 text-body-2xlg font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]">
        Region labels
      </h2>

      <Map />
    </div>
  );
}