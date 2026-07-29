// src/zones/blog/_components/Cards.tsx
// GitButler-style post cards: image on canvas, serif titles, no card frames.
// Tiling/layout classes (bt-*) live in blog-tiles.scss.

import Link  from "next/link";
import Image from "next/image";
import { cn } from "@/utils/cn";
import { formatDate, type BlogPostSummary } from "./helpers";

/** Deterministic placeholder variant (bt-ph--0 … bt-ph--4) from the slug. */
function phVariant(slug: string): number {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h % 5;
}

function Cover({
  post,
  className,
  sizes,
  fit = "crop",
}: {
  post: BlogPostSummary;
  className?: string;
  sizes?: string;
  /** "crop" (default) = full-bleed object-cover. Covers are normalized to
      1200×630 on upload and tiles share that exact ratio, so this displays
      them edge-to-edge with zero actual cropping.
      "frame" = blurred canvas + contained art — fallback for odd-ratio
      images if the upload pipeline is ever bypassed. */
  fit?: "frame" | "crop";
}) {
  return (
    // Theme radius, not a fixed rounded-xl — bt-frame::after (blog-tiles.scss)
    // already does `border-radius: inherit`, so this one class is the single
    // source of truth for how rounded every cover on the blog is.
    <div className={cn("bt-frame relative w-full overflow-hidden rounded-[var(--radius)]", className)}>
      {post.coverImage ? (
        fit === "crop" ? (
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            sizes={sizes}
            // Covers are already normalized to a fixed 1200x630 on upload, so
            // Next's responsive-resize optimizer buys little here — but its
            // sharp transcode runs cold after every deploy (no persistent
            // image cache in this self-hosted setup) and was the actual
            // source of "More to Read" images taking seconds to appear.
            // Served as-is straight from storage instead: same bytes every
            // time, no server-side transcode step to be slow or cold.
            unoptimized
            className="object-cover transition duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <>
            {/* Blurred canvas — the cover itself fills the tile behind the art */}
            <Image
              src={post.coverImage}
              alt=""
              aria-hidden
              fill
              sizes={sizes}
              unoptimized
              className="bt-cover-bg"
            />
            {/* Full uncropped cover floating on the canvas */}
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              sizes={sizes}
              unoptimized
              className="bt-cover-fg transition duration-500 group-hover:scale-[1.03]"
            />
          </>
        )
      ) : (
        <div className={cn("bt-ph", `bt-ph--${phVariant(post.slug)}`)}>
          <span className="font-serif">✎</span>
        </div>
      )}
    </div>
  );
}

function MetaLine({
  post,
  className = "mt-3",
}: {
  post: BlogPostSummary;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-[hsl(var(--muted-foreground))]", className)}>
      {post.publishedAt && <span>{formatDate(post.publishedAt)}</span>}
      {post.publishedAt && post.author && <span className="mx-2">•</span>}
      {post.author && <span>by {post.author}</span>}
    </p>
  );
}

/** Hero card — newest post. Cover left, text right (GitButler front page). */
export function FeaturedCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link href={`/${post.slug}`} className="group bt-hero">
      <Cover
        post={post}
        className="bt-cover-hero"
        sizes="(min-width: 1024px) 55vw, 100vw"
      />
      <div>
        <MetaLine post={post} className="" />
        <h2 className="mt-3 font-serif text-3xl leading-tight text-[hsl(var(--foreground))] group-hover:text-primary md:text-5xl">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="mt-4 text-base leading-relaxed text-[hsl(var(--muted-foreground))] line-clamp-3">
            {post.excerpt}
          </p>
        )}
      </div>
    </Link>
  );
}

/** Grid tile — square by default (trio row), tall via coverClass (bento lead). */
export function GridCard({
  post,
  coverClass = "bt-cover-trio",
}: {
  post: BlogPostSummary;
  coverClass?: string;
}) {
  return (
    <Link href={`/${post.slug}`} className="group block">
      <Cover
        post={post}
        className={coverClass}
        sizes="(min-width: 768px) 33vw, 100vw"
      />
      <h3 className="mt-5 font-serif text-2xl leading-snug text-[hsl(var(--foreground))] group-hover:text-primary md:text-3xl">
        {post.title}
      </h3>
      <MetaLine post={post} />
      {post.excerpt && (
        <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))] line-clamp-3">
          {post.excerpt}
        </p>
      )}
    </Link>
  );
}

/** Compact horizontal card — thumbnail left, text right (bento side slot). */
export function RowCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link href={`/${post.slug}`} className="group flex gap-5 sm:gap-7">
      <Cover
        post={post}
        className="bt-cover-sm w-[124px] shrink-0 sm:w-[152px]"
        sizes="152px"
      />
      <div className="min-w-0">
        <h3 className="font-serif text-xl leading-snug text-[hsl(var(--foreground))] group-hover:text-primary sm:text-2xl">
          {post.title}
        </h3>
        <MetaLine post={post} />
        {post.excerpt && (
          <p className="mt-1.5 text-sm leading-relaxed text-[hsl(var(--muted-foreground))] line-clamp-2">
            {post.excerpt}
          </p>
        )}
      </div>
    </Link>
  );
}
