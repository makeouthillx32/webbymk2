import { cn } from "@/lib/utils";
import { useId } from "react";

interface PropsType {
  label: string;
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  icon?: React.ReactNode;
  defaultValue?: string;
}

export function TextAreaGroup({
  label,
  placeholder,
  required,
  disabled,
  active,
  className,
  icon,
  defaultValue,
}: PropsType) {
  const id = useId();

  return (
    <div className={cn(className)}>
      <label
        htmlFor={id}
        className="mb-3 block text-body-sm font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]"
      >
        {label}
      </label>

      <div className="relative mt-3 [&_svg]:pointer-events-none [&_svg]:absolute [&_svg]:left-5.5 [&_svg]:top-5.5 [&_svg]:text-[hsl(var(--muted-foreground))]">
        <textarea
          id={id}
          rows={6}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className={cn(
            "w-full rounded-[var(--radius)] border-[1.5px] border-[hsl(var(--border))] bg-transparent px-5.5 py-3 text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--sidebar-primary))] disabled:cursor-default disabled:bg-[hsl(var(--muted))] data-[active=true]:border-[hsl(var(--sidebar-primary))] dark:border-[hsl(var(--border))] dark:bg-[hsl(var(--secondary))] dark:text-[hsl(var(--foreground))] dark:focus:border-[hsl(var(--sidebar-primary))] dark:disabled:bg-[hsl(var(--muted))] dark:data-[active=true]:border-[hsl(var(--sidebar-primary))]",
            icon && "py-5 pl-13 pr-5",
          )}
          required={required}
          disabled={disabled}
          data-active={active}
        />

        {icon}
      </div>
    </div>
  );
}