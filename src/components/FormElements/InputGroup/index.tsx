import { cn } from "@/lib/utils";
import { type HTMLInputTypeAttribute, useId } from "react";

type InputGroupProps = {
  className?: string;
  label: string;
  placeholder: string;
  type: HTMLInputTypeAttribute;
  fileStyleVariant?: "style1" | "style2";
  required?: boolean;
  disabled?: boolean;
  active?: boolean;
  handleChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  value?: string;
  name?: string;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  height?: "sm" | "default";
  defaultValue?: string;
};

const InputGroup: React.FC<InputGroupProps> = ({
  className,
  label,
  type,
  placeholder,
  required,
  disabled,
  active,
  handleChange,
  icon,
  ...props
}) => {
  const id = useId();

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="text-body-sm font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]"
      >
        {label}
        {required && <span className="ml-1 select-none text-[hsl(var(--destructive))]">*</span>}
      </label>

      <div
        className={cn(
          "relative mt-3 [&_svg]:absolute [&_svg]:top-1/2 [&_svg]:-translate-y-1/2",
          props.iconPosition === "left"
            ? "[&_svg]:left-4.5"
            : "[&_svg]:right-4.5",
        )}
      >
        <input
          id={id}
          type={type}
          name={props.name}
          placeholder={placeholder}
          onChange={handleChange}
          value={props.value}
          defaultValue={props.defaultValue}
          className={cn(
            "w-full rounded-[var(--radius)] border-[1.5px] border-[hsl(var(--border))] bg-transparent outline-none transition focus:border-[hsl(var(--sidebar-primary))] disabled:cursor-default disabled:bg-[hsl(var(--muted))] data-[active=true]:border-[hsl(var(--sidebar-primary))] dark:border-[hsl(var(--sidebar-border))] dark:bg-[hsl(var(--card))] dark:focus:border-[hsl(var(--sidebar-primary))] dark:disabled:bg-[hsl(var(--muted))] dark:data-[active=true]:border-[hsl(var(--sidebar-primary))]",
            type === "file"
              ? getFileStyles(props.fileStyleVariant!)
              : "px-5.5 py-3 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--card-foreground))]",
            props.iconPosition === "left" && "pl-12.5",
            props.height === "sm" && "py-2.5",
          )}
          required={required}
          disabled={disabled}
          data-active={active}
        />

        {icon}
      </div>
    </div>
  );
};

export default InputGroup;

function getFileStyles(variant: "style1" | "style2") {
  switch (variant) {
    case "style1":
      return `file:mr-5 file:border-collapse file:cursor-pointer file:border-0 file:border-r file:border-solid file:border-[hsl(var(--border))] file:bg-[hsl(var(--accent))] file:px-6.5 file:py-[13px] file:text-body-sm file:font-medium file:text-[hsl(var(--muted-foreground))] file:hover:bg-[hsl(var(--sidebar-primary))] file:hover:bg-opacity-10 dark:file:border-[hsl(var(--sidebar-border))] dark:file:bg-[hsl(var(--card))]/30 dark:file:text-[hsl(var(--card-foreground))]`;
    default:
      return `file:mr-4 file:rounded file:border-[0.5px] file:border-[hsl(var(--border))] file:bg-[hsl(var(--muted))] file:px-2.5 file:py-1 file:text-body-xs file:font-medium file:text-[hsl(var(--muted-foreground))] file:focus:border-[hsl(var(--sidebar-primary))] dark:file:border-[hsl(var(--sidebar-border))] dark:file:bg-[hsl(var(--card))]/30 dark:file:text-[hsl(var(--card-foreground))] px-3 py-[9px]`;
  }
}