// app/settings/mail/page.tsx
"use client";

import { useState } from "react";
import { FilterTabs } from "@/components/dashboard/FilterTabs";
import { DomainsPanel } from "./_components/DomainsPanel";
import { BoxesPanel } from "./_components/BoxesPanel";
import { FailuresPanel } from "./_components/FailuresPanel";

export default function MailPage() {
  const [tab, setTab] = useState<"boxes" | "domains" | "failures">("boxes");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">Mail</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage mailboxes and domains on mail.unenter.live (poste.io) — the SMTP relay behind auth
            emails and order confirmations.
          </p>
        </div>
      </div>

      <FilterTabs
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
        options={[
          { value: "boxes", label: "Mailboxes" },
          { value: "domains", label: "Domains & DKIM" },
          { value: "failures", label: "Delivery Failures" },
        ]}
      />

      {tab === "boxes" ? (
        <BoxesPanel />
      ) : tab === "domains" ? (
        <DomainsPanel />
      ) : (
        <FailuresPanel />
      )}
    </div>
  );
}
