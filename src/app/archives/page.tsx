import React, { Suspense } from "react";
import { ArchivePageClient } from "@/zones/tank/public/ArchivePageClient";

export const metadata = {
  title: "Archives | Tank Live Video Catalog",
  description: "Browse historical video security archives and VOD recordings room by room.",
};

export default function ArchivesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 p-8 text-amber-400 font-mono text-sm">Loading Archives Vault...</div>}>
      <ArchivePageClient />
    </Suspense>
  );
}
