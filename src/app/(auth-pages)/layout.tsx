// app/(auth-pages)/layout.tsx
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="
        min-h-[100dvh]
        w-full
        flex
        items-center
        justify-center
        px-4 md:px-6 lg:px-12
        bg-gradient-to-br
        from-[hsl(var(--background))]
        via-[hsl(var(--muted))]
        to-[hsl(var(--accent))]
      "
    >
      {children}
    </div>
  );
}