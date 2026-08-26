"use client";

import { useEffect, useState } from "react";

function allowedUnenterHost(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const candidate = value.includes("://") ? new URL(value).hostname : value;
    const host = candidate.trim().toLowerCase().replace(/\.$/, "");
    const isUnenter = host === "unenter.live" || host.endsWith(".unenter.live");
    if (!isUnenter || host === "status.unenter.live") return null;
    return host;
  } catch {
    return null;
  }
}

function endpointLabel(host: string) {
  if (host === "unenter.live") return "Unenter";
  const name = host.slice(0, -".unenter.live".length).split(".")[0] ?? host;
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default function RedirectNotice({ from }: { from?: string | null }) {
  const [sourceHost, setSourceHost] = useState(() => allowedUnenterHost(from));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sourceHost) return;
    setSourceHost(allowedUnenterHost(document.referrer));
  }, [sourceHost]);

  if (!sourceHost || dismissed) return null;

  return (
    <aside className="redirect-notice" role="status" aria-live="polite">
      <div>
        <strong>You were safely redirected from {endpointLabel(sourceHost)}.</strong>
        <span>
          The endpoint <code>{sourceHost}</code> did not answer, so UNAXIS sent you to this independently hosted status page instead of showing a 502.
        </span>
      </div>
      <div className="redirect-actions">
        <a href={`https://${sourceHost}`}>Try again</a>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss redirect notice">
          Dismiss
        </button>
      </div>
    </aside>
  );
}
