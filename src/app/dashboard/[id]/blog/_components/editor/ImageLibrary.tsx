"use client";
// Every image ever recorded in blog_post_images — this post's own uploads plus
// the unattached pool the ingest agent writes into. Previously write-only: the
// rows existed but nothing in the dashboard ever read them back.

import { useEffect, useState } from "react";
import { ImageOff, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blogAdmin } from "@/lib/blog/client";
import { supabasePublicUrlFromImage } from "@/lib/images";
import type { BlogImageRow } from "@/types/blog";

interface LibraryImage extends BlogImageRow {
  url: string | null;
}

function withUrls(rows: BlogImageRow[]): LibraryImage[] {
  return rows.map((row) => ({ ...row, url: supabasePublicUrlFromImage(row) }));
}

export function ImageLibrary({
  postId,
  onInsert,
}: {
  postId: string | null;
  /** Called with a ready-to-paste markdown image tag. */
  onInsert: (markdown: string) => void;
}) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [own, loose] = await Promise.all([
        postId ? blogAdmin.listImages(postId).catch(() => []) : Promise.resolve([]),
        blogAdmin.listImages(null).catch(() => []),
      ]);
      setImages(withUrls([...own, ...loose]).filter((image) => image.url));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        Loading library…
      </p>
    );
  }

  if (images.length === 0) {
    return (
      <p className="inline-flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <ImageOff size={13} aria-hidden="true" />
        Nothing here yet — uploads and agent ingests show up automatically.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto pr-1">
        {images.map((image) => (
          <button
            key={image.id}
            type="button"
            title={`Insert ${image.object_path}`}
            onClick={() => onInsert(`\n![${image.alt_text ?? ""}](${image.url})\n`)}
            className="group relative aspect-[4/3] overflow-hidden rounded border border-[hsl(var(--border))] transition hover:border-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url ?? ""}
              alt={image.alt_text ?? ""}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
              insert
            </span>
          </button>
        ))}
      </div>

      <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
        <RefreshCw size={13} />
        Refresh
      </Button>
    </div>
  );
}
