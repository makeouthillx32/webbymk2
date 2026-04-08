// components/POS/skeleton.tsx
"use client";

export function POSSkeleton() {
  return (
    <div className="flex h-[100dvh] md:h-[calc(100vh-4rem)] bg-background animate-pulse overflow-hidden">

      {/* Left: Product Grid skeleton — full width on mobile, flex-1 on md+ */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border">
        {/* Tab bar */}
        <div className="flex gap-0 px-4 border-b border-border h-12 items-center">
          {["Reader", "Keypad", "Library", "Favorites"].map((label) => (
            <div key={label} className="h-4 w-14 bg-muted rounded mx-2 flex-shrink-0" />
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-hidden p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <div className="aspect-square bg-muted" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Cart skeleton — hidden on mobile, shown md+ */}
      <div className="hidden md:flex w-[320px] xl:w-[360px] flex-col border-l border-border">
        <div className="p-4 border-b border-border">
          <div className="h-6 bg-muted rounded w-24" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg border border-border">
              <div className="w-12 h-12 bg-muted rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border space-y-3">
          <div className="h-5 bg-muted rounded w-full" />
          <div className="h-12 bg-muted rounded-lg w-full" />
        </div>
      </div>

      {/* Mobile bottom bar skeleton */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden h-14 bg-card border-t border-border flex items-center px-4 gap-3">
        <div className="w-6 h-6 bg-muted rounded-full" />
        <div className="flex-1 h-4 bg-muted rounded" />
        <div className="w-16 h-4 bg-muted rounded" />
      </div>

    </div>
  );
}