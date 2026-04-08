// app/settings/top-banner/_components/ErrorAlert.tsx
"use client";

import { AlertTriangle } from "lucide-react";

type Props = {
  message: string;
  onRetry?: () => void;
};

export function ErrorAlert({ message, onRetry }: Props) {
  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--destructive))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-[hsl(var(--destructive))]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Something went wrong
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {message}
          </p>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm hover:bg-[hsl(var(--muted))]"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}