// app/settings/mail/_components/SetupResultsPanel.tsx
// Summary shown after "Set up standard mailboxes" — the only place these
// generated passwords are ever shown, so make them easy to copy and paste
// straight into .env.
"use client";

import { useState } from "react";
import { Copy, Check, X } from "lucide-react";

type SetupResult = {
  email: string;
  status: "created" | "exists" | "error";
  password?: string;
  error?: string;
};

function CopyableRow({ result }: { result: SetupResult }) {
  const [copied, setCopied] = useState(false);

  if (result.status === "exists") {
    return (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span className="font-mono">{result.email}</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">already existed — skipped</span>
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span className="font-mono">{result.email}</span>
        <span className="text-xs text-[hsl(var(--destructive))]">{result.error}</span>
      </div>
    );
  }

  const copy = () => {
    navigator.clipboard.writeText(result.password ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="font-mono">{result.email}</span>
      <div className="flex items-center gap-2">
        <code className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">{result.password}</code>
        <button onClick={copy} className="rounded-[var(--radius)] p-1 hover:bg-[hsl(var(--muted))]">
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function SetupResultsPanel({ results, onClose }: { results: SetupResult[]; onClose: () => void }) {
  const createdCount = results.filter((r) => r.status === "created").length;

  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {createdCount > 0 ? `Created ${createdCount} mailbox${createdCount !== 1 ? "es" : ""}` : "Nothing to create"}
          </p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            Copy each password into .env now — poste.io won't show them again. Then run{" "}
            <code className="rounded bg-[hsl(var(--muted))] px-1">unaxis recreate-core app</code> (and{" "}
            <code className="rounded bg-[hsl(var(--muted))] px-1">recreate-core auth</code> if you changed
            SMTP_USER/PASS) to pick them up live.
          </p>
        </div>
        <button onClick={onClose} className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 divide-y divide-[hsl(var(--border))]">
        {results.map((r) => (
          <CopyableRow key={r.email} result={r} />
        ))}
      </div>
    </div>
  );
}
