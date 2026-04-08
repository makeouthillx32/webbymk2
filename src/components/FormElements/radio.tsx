import { cn } from "@/lib/utils";
import { useId } from "react";

type PropsType = {
  variant?: "dot" | "circle";
  label: string;
  name?: string;
  value?: string;
  minimal?: boolean;
};

export function RadioInput({
  label,
  variant = "dot",
  name,
  value,
  minimal,
}: PropsType) {
  const id = useId();

  return (
    <div>
      <label
        htmlFor={id}
        className="flex cursor-pointer select-none items-center text-body-sm font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]"
      >
        <div className="relative">
          <input
            type="radio"
            name={name}
            id={id}
            className="peer sr-only"
            value={value}
          />
          <div
            className={cn(
              "mr-2 flex size-5 items-center justify-center rounded-full border peer-checked:[&>*]:block",
              {
                "border-[hsl(var(--sidebar-primary))] peer-checked:border-6": variant === "circle",
                "border-[hsl(var(--muted-foreground))] peer-checked:border-[hsl(var(--sidebar-primary))] peer-checked:bg-[hsl(var(--muted))] dark:border-[hsl(var(--muted-foreground))] dark:peer-checked:bg-[hsl(var(--secondary))]":
                  variant === "dot",
              },
              minimal && "border-[hsl(var(--border))] dark:border-[hsl(var(--sidebar-border))]",
            )}
          >
            <span
              className={cn(
                "hidden size-2.5 rounded-full bg-[hsl(var(--sidebar-primary))]",
                variant === "circle" && "bg-transparent",
              )}
            />
          </div>
        </div>
        <span>{label}</span>
      </label>
    </div>
  );
}