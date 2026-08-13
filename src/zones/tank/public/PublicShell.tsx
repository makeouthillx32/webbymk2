import Link from "next/link";
import { Radio, Search, Shield, Video } from "lucide-react";
import type { ReactNode } from "react";

const coreSignIn =
  "https://www.unenter.live/sign-in?next=https%3A%2F%2Ftank.unenter.live%2F";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="container flex h-16 items-center gap-4">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2 font-bold tracking-tight"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition group-hover:-rotate-3">
              <Video className="h-5 w-5" />
            </span>
            <span className="text-lg">
              TANK<span className="text-primary">.</span>
            </span>
          </Link>
          <nav
            className="hidden items-center gap-1 sm:flex"
            aria-label="Tank navigation"
          >
            <Link
              href="/browse"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Browse
            </Link>
            <Link
              href="/cameras"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Cameras
            </Link>
            <Link
              href="/rooms/director"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Director
            </Link>
          </nav>
          <Link
            href="/browse"
            className="ml-auto hidden min-w-0 max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground md:flex"
          >
            <Search className="h-4 w-4" />
            Search rooms and channels
          </Link>
          <Link
            href="/admin"
            className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
          >
            <Shield className="h-4 w-4" />
            Backstage
          </Link>
          <a
            href={coreSignIn}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            Sign in
          </a>
        </div>
      </div>
      {children}
      <footer className="border-t border-border/70 bg-card/40">
        <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />A live Unenter experiment.
          </div>
          <div className="flex gap-5">
            <Link href="/browse" className="hover:text-foreground">
              Browse
            </Link>
            <Link href="/cameras" className="hover:text-foreground">
              Cameras
            </Link>
            <Link href="/admin" className="hover:text-foreground">
              Backstage
            </Link>
            <span>Viewer-safe delivery</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
