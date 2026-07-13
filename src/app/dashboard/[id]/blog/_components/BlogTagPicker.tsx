"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface TagRow {
  id: string;
  slug: string;
  name: string;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function BlogTagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tagIds: string[]) => void;
}) {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/blog/admin/tags", { signal: controller.signal })
      .then(readJson)
      .then((result) => {
        if (result?.ok) setTags(result.data);
        else toast.error(result?.error?.message ?? "Failed to load tags");
      })
      .catch((error) => {
        if (error?.name !== "AbortError") toast.error("Failed to load tags");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTags = useMemo(() => {
    if (!normalizedQuery) return tags;
    return tags.filter((tag) =>
      tag.name.toLowerCase().includes(normalizedQuery) ||
      tag.slug.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, tags]);
  const selectedTags = tags.filter((tag) => value.includes(tag.id));
  const exactMatch = tags.find(
    (tag) => tag.name.toLowerCase() === normalizedQuery || tag.slug.toLowerCase() === normalizedQuery,
  );

  const toggleTag = (tagId: string) => {
    onChange(value.includes(tagId) ? value.filter((id) => id !== tagId) : [...value, tagId]);
  };

  const resolveQuery = async () => {
    const name = query.trim();
    if (!name || creating) return;

    if (exactMatch) {
      if (!value.includes(exactMatch.id)) onChange([...value, exactMatch.id]);
      setQuery("");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/blog/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await readJson(response);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error?.message ?? "Tag creation failed");
      }

      const created = result.data as TagRow;
      setTags((current) =>
        [...current.filter((tag) => tag.id !== created.id), created].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      if (!value.includes(created.id)) onChange([...value, created.id]);
      setQuery("");
      toast.success(`Tag ${created.name} is ready`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tag creation failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Selected tags">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 py-1 pl-3 pr-1.5 text-xs text-primary"
            >
              {tag.name}
              <button
                type="button"
                title={`Remove ${tag.name}`}
                aria-label={`Remove ${tag.name}`}
                onClick={() => toggleTag(tag.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/15"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void resolveQuery();
              }
            }}
            placeholder="Search or create tag"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent py-2 pl-9 pr-3 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {normalizedQuery && !exactMatch && (
          <Button type="button" size="sm" variant="outline" onClick={resolveQuery} disabled={creating}>
            {creating ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={14} aria-hidden="true" />
            )}
            Create
          </Button>
        )}
      </div>

      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
        {loading ? (
          <span className="inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Loading tags
          </span>
        ) : filteredTags.length > 0 ? (
          filteredTags.map((tag) => {
            const active = value.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                )}
              >
                {active && <Check size={12} aria-hidden="true" />}
                {tag.name}
              </button>
            );
          })
        ) : (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {normalizedQuery ? "No matching tag" : "No tags yet"}
          </span>
        )}
      </div>
    </div>
  );
}
