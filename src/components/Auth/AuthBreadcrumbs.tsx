"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function AuthBreadcrumbs({ current }: { current: string }) {
  const router = useRouter();

  return (
    <div className="mb-4 flex items-center justify-between">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <nav className="text-xs text-[hsl(var(--muted-foreground))]">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[hsl(var(--foreground))]">{current}</span>
      </nav>
    </div>
  );
}