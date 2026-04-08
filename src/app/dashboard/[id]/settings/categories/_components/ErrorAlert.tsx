// app/settings/categories/_components/ErrorAlert.tsx
"use client";

import { AlertTriangle } from "lucide-react";

type Props = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorAlert({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
}: Props) {
  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-[hsl(var(--destructive))]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{message}</p>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center justify-center rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            >
              {retryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}