// app/dashboard/[id]/settings/landing/_components/useLandingSections.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { LandingSectionRow } from "./types";

export function useLandingSections() {
  const [sections, setSections] = useState<LandingSectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/landing/sections", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message || 'Failed to load sections');
      }

      // Sort by position
      const sorted = (data.sections || []).sort((a: LandingSectionRow, b: LandingSectionRow) => 
        a.position - b.position
      );

      setSections(sorted);
    } catch (err: any) {
      setError(err.message || 'Failed to load landing sections');
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePositions = useCallback(async (reorderedSections: LandingSectionRow[]) => {
    // Optimistically update UI
    setSections(reorderedSections);

    try {
      // Build swap array with new positions
      const swaps = reorderedSections.map((section, index) => ({
        id: section.id,
        position: index + 1, // 1-based positioning
      }));

      const res = await fetch('/api/landing/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swap: swaps }),
      });

      if (!res.ok) {
        throw new Error('Failed to update positions');
      }

      // Refresh to get latest from DB
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update positions');
      // Revert on error
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sections, loading, error, refresh, updatePositions };
}
