import { CheckIcon, XIcon } from "@/assets/icons";
import { cn } from "@/lib/utils";
import { useId } from "react";

type PropsType = {
  withIcon?: "check" | "x";
  withBg?: boolean;
  label: string;
  name?: string;
  minimal?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  radius?: "default" | "md";
};

export function Checkbox({
  withIcon,
  label,
  name,
  withBg,
  minimal,
  onChange,
  radius,
}: PropsType) {
  const id = useId();

  return (
    <div>
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer select-none items-center text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]",
          !minimal && "text-body-sm font-medium",
        )}
      >
        <div className="relative">
          <input
            type="checkbox"
            onChange={onChange}
            name={name}
            id={id}
            className="peer sr-only"
          />

          <div
            className={cn(
              "mr-2 flex size-5 items-center justify-center rounded-[calc(var(--radius)*0.5)] border border-[hsl(var(--muted-foreground))] peer-checked:border-[hsl(var(--sidebar-primary))] dark:border-[hsl(var(--muted-foreground))] peer-checked:[&>*]:block",
              withBg
                ? "peer-checked:bg-[hsl(var(--sidebar-primary))] [&>*]:text-[hsl(var(--sidebar-primary-foreground))]"
                : "peer-checked:bg-[hsl(var(--muted))] dark:peer-checked:bg-transparent",
              minimal && "mr-3 border-[hsl(var(--border))] dark:border-[hsl(var(--sidebar-border))]",
              radius === "md" && "rounded-md",
            )}
          >
            {!withIcon && (
              <span className="hidden size-2.5 rounded-sm bg-[hsl(var(--sidebar-primary))]" />
            )}

            {withIcon === "check" && (
              <CheckIcon className="hidden text-[hsl(var(--sidebar-primary))]" />
            )}

            {withIcon === "x" && <XIcon className="hidden text-[hsl(var(--sidebar-primary))]" />}
          </div>
        </div>
        <span>{label}</span>
      </label>
    </div>
  );
}