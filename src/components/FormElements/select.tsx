"use client";

import { ChevronUpIcon } from "@/assets/icons";
import { cn } from "@/lib/utils";
import { useId, useState } from "react";

type PropsType = {
  label: string;
  items: { value: string; label: string }[];
  prefixIcon?: React.ReactNode;
  className?: string;
} & (
  | { placeholder?: string; defaultValue: string }
  | { placeholder: string; defaultValue?: string }
);

export function Select({
  items,
  label,
  defaultValue,
  placeholder,
  prefixIcon,
  className,
}: PropsType) {
  const id = useId();

  const [isOptionSelected, setIsOptionSelected] = useState(false);

  return (
    <div className={cn("space-y-3", className)}>
      <label
        htmlFor={id}
        className="block text-body-sm font-medium text-[hsl(var(--foreground))]"
      >
        {label}
      </label>

      <div className="relative">
        {prefixIcon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]">
            {prefixIcon}
          </div>
        )}

        <select
          id={id}
          defaultValue={defaultValue || ""}
          onChange={() => setIsOptionSelected(true)}
          className={cn(
            "w-full appearance-none rounded-[var(--radius)] border border-[hsl(var(--border))] bg-transparent px-5.5 py-3 outline-none transition focus:border-[hsl(var(--sidebar-primary))] active:border-[hsl(var(--sidebar-primary))] dark:border-[hsl(var(--border))] dark:bg-[hsl(var(--secondary))] dark:focus:border-[hsl(var(--sidebar-primary))] [&>option]:text-[hsl(var(--muted-foreground))] dark:[&>option]:text-[hsl(var(--muted-foreground))]",
            isOptionSelected && "text-[hsl(var(--foreground))]",
            prefixIcon && "pl-11.5",
          )}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}

          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <ChevronUpIcon className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-180 text-[hsl(var(--muted-foreground))]" />
      </div>
    </div>
  );
}