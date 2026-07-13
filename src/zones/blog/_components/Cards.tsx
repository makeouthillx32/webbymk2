// src/zones/blog/_components/Cards.tsx
// GitButler-style post cards: image on canvas, serif titles, no card frames.

import Link  from "next/link";
import Image from "next/image";
import { cn } from "@/utils/cn";
import { formatDate, type BlogPostSummary } from "./helpers";

function Cover({
  post,
  className,
  sizes,
}: {
  post: BlogPostSummary;
  className?: string;
  sizes?: string;
}) {
  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl", className)}>
      {post.coverImage ? (
        <Image
          src={post.coverImage}
          alt={post.title}
          fill
          sizes={sizes}
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--muted))]">
          <span className="font-serif text-6xl text-[hsl(var(--muted-foreground))]/40">✎</span>
        </div>
      )}
    </div>
  );
}

function MetaLine({ post }: { post: BlogPostSummary }) {
  return (
    <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
      {post.publishedAt && <span>{formatDate(post.publishedAt)}</span>}
      {post.publishedAt && post.author && <span className="mx-2">•</span>}
      {post.author && <span>by {post.author}</span>}
    </p>
  );
}

/** Full-width hero card — newest post. */
export function FeaturedCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link href={`/${post.slug}`} className="group block">
      <Cover post={post} className="h-[260px] sm:h-[360px] lg:h-[440px]" sizes="100vw" />
      <h2 className="mt-6 font-serif text-3xl leading-tight text-[hsl(var(--foreground))] group-hover:text-primary md:text-5xl">
        {post.title}
      </h2>
      <MetaLine post={post} />
      {post.excerpt && (
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-[hsl(var(--muted-foreground))] line-clamp-3">
          {post.excerpt}
        </p>
      )}
    </Link>
  );
}

/** Large grid card — 2-col sections. */
export function GridCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link href={`/${post.slug}`} className="group block">
      <Cover post={post} className="h-[200px] sm:h-[240px]" sizes="(min-width: 768px) 50vw, 100vw" />
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

/** Compact horizontal card — thumbnail left, text right. */
export function RowCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link href={`/${post.slug}`} className="group flex gap-5 sm:gap-7">
      <Cover
        post={post}
        className="h-[96px] w-[96px] shrink-0 sm:h-[120px] sm:w-[120px]"
        sizes="120px"
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
