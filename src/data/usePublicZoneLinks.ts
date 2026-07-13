"use client";

import { useEffect, useState } from "react";

export type PublicZoneLink = {
  key: string;
  label: string;
  domain: string;
  href: string;
};

type PublicZonesResponse =
  | { ok: true; data: PublicZoneLink[] }
  | { ok: false; error?: string };

type UsePublicZoneLinksResult = {
  data: PublicZoneLink[];
  loading: boolean;
};

export function usePublicZoneLinks(): UsePublicZoneLinksResult {
  const [links, setLinks] = useState<PublicZoneLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadLinks() {
      try {
        const response = await fetch("/api/public/zones");
        const payload = (await response.json()) as PublicZonesResponse;
        if (!cancelled && response.ok && payload.ok) {
          setLinks(payload.data);
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[usePublicZoneLinks] Failed to load links:", error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLinks();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data: links, loading };
}
