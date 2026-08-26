"use client";
// Publish state + schedule. A published post with a future date is scheduled,
// not live — the panel says so instead of leaving the author to work it out.

import { CalendarClock, Check } from "lucide-react";
import { Field, fieldControlClass } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { fromDateTimeLocal, postStatus, toDateTimeLocal } from "@/lib/blog/posts";
import type { BlogPostDraft } from "@/types/blog";

export function PublishPanel({
  draft,
  onChange,
}: {
  draft: BlogPostDraft;
  onChange: <K extends keyof BlogPostDraft>(key: K, value: BlogPostDraft[K]) => void;
}) {
  const status = postStatus(draft);

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--foreground))]">
        <input
          type="checkbox"
          checked={draft.is_published}
          onChange={(event) => onChange("is_published", event.target.checked)}
          className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--primary))]"
        />
        Published
      </label>

      <Field label="Publish date" htmlFor="post-published-at">
        <input
          id="post-published-at"
          type="datetime-local"
          className={cn(fieldControlClass, "h-10")}
          value={toDateTimeLocal(draft.published_at)}
          onChange={(event) => onChange("published_at", fromDateTimeLocal(event.target.value))}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            onChange("is_published", true);
            onChange("published_at", new Date().toISOString());
          }}
        >
          <Check size={14} />
          Publish now
        </Button>
        {draft.published_at ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange("published_at", null)}
          >
            Clear date
          </Button>
        ) : null}
      </div>

      {status === "scheduled" ? (
        <p className="inline-flex items-start gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <CalendarClock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          Dated in the future — it stays off the live index until then.
        </p>
      ) : null}
    </div>
  );
}
