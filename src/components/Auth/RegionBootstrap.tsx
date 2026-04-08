"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { detectRegionFromTimezone } from "@/lib/region";

type RegionCode = ReturnType<typeof detectRegionFromTimezone>;

export default function RegionBootstrap() {
  useEffect(() => {
    const run = async () => {
      const supabase = createClient();

      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user?.id) return;

      // Read profile region
      const { data: profile, error: readErr } = await supabase
        .from("profiles")
        .select("region")
        .eq("id", user.id)
        .single();

      if (readErr) {
        console.warn("[RegionBootstrap] profile read failed:", readErr.message);
        return;
      }

      // If already set, do nothing
      if (profile?.region) return;

      const region: RegionCode = detectRegionFromTimezone();

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ region })
        .eq("id", user.id);

      if (updateErr) {
        console.warn("[RegionBootstrap] region update failed:", updateErr.message);
        return;
      }

      // Optional: cache locally (fast UI reads)
      try {
        document.cookie = `userRegion=${region}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
      } catch {}
    };

    run();
  }, []);

  return null;
}