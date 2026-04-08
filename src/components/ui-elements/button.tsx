import { cva, VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2.5 text-center font-medium hover:bg-opacity-90 font-medium transition focus:outline-none",
  {
    variants: {
      variant: {
        primary: "bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]",
        green: "bg-[hsl(var(--chart-2))] text-[hsl(var(--sidebar-primary-foreground))]",
        dark: "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] dark:bg-[hsl(var(--card-foreground))]/10",
        outlinePrimary:
          "border border-[hsl(var(--sidebar-primary))] hover:bg-[hsl(var(--sidebar-primary))]/10 text-[hsl(var(--sidebar-primary))]",
        outlineGreen: "border border-[hsl(var(--chart-2))] hover:bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]",
        outlineDark:
          "border border-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground))]/10 text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--card-foreground))]/10 dark:border-[hsl(var(--card-foreground))]/25 dark:text-[hsl(var(--card-foreground))]",
      },
      shape: {
        default: "",
        rounded: "rounded-[calc(var(--radius)*0.5)]",
        full: "rounded-full",
      },
      size: {
        default: "py-3.5 px-10 py-3.5 lg:px-8 xl:px-10",
        small: "py-[11px] px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      shape: "default",
      size: "default",
    },
  },
);

type ButtonProps = HTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    label: string;
    icon?: React.ReactNode;
  };

export function Button({
  label,
  icon,
  variant,
  shape,
  size,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonVariants({ variant, shape, size, className })}
      {...props}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}