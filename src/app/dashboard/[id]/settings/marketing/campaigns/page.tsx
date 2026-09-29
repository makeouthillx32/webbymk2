"use client";

import { useEffect, useState } from "react";
import CampaignCalendar from "./_components/CampaignCalendar";

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export default function AdCampaignsPage() {
  const [userRole, setUserRole] = useState("marketing");

  useEffect(() => {
    setUserRole(getCookie("userRole") || "marketing");
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Ad Campaigns</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Draft and schedule ad campaigns across platforms. Planning only for now — publishing
          live to Meta/TikTok/LinkedIn/Google/X/YouTube needs an OAuth app registered with each
          platform first.
        </p>
      </div>

      <CampaignCalendar userRole={userRole} />
    </div>
  );
}
