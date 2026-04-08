import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type PropsType = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function ShowcaseSection({ title, children, className }: PropsType) {
  return (
    <div className="rounded-[var(--radius)] bg-[hsl(var(--background))] shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]">
      <h2 className="border-b border-[hsl(var(--border))] px-4 py-4 font-medium text-[hsl(var(--foreground))] dark:border-[hsl(var(--sidebar-border))] dark:text-[hsl(var(--card-foreground))] sm:px-6 xl:px-7.5">
        {title}
      </h2>

      <div className={cn("p-4 sm:p-6 xl:p-10", className)}>{children}</div>
    </div>
  );
}