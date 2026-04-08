"use client";

import { ChevronUpIcon } from "@/assets/icons";
import { cn } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Dropdown, DropdownContent, DropdownTrigger } from "./Layouts/app/dropdown";

type PropsType<TItem> = {
  defaultValue?: TItem;
  items?: TItem[];
  sectionKey: string;
  minimal?: boolean;
};

const PARAM_KEY = "selected_time_frame";

export function PeriodPicker<TItem extends string>({
  defaultValue,
  sectionKey,
  items,
  minimal,
}: PropsType<TItem>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dropdown isOpen={isOpen} setIsOpen={setIsOpen}>
      <DropdownTrigger
        className={cn(
          "flex h-8 w-full items-center justify-between gap-x-1 rounded-[calc(var(--radius)*0.75)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] outline-none ring-offset-[hsl(var(--background))] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-[hsl(var(--muted-foreground))] dark:border-[hsl(var(--sidebar-border))] dark:bg-[hsl(var(--card))] dark:text-[hsl(var(--card-foreground))] dark:ring-offset-[hsl(var(--card))] dark:focus:ring-[hsl(var(--sidebar-ring))] dark:data-[placeholder]:text-[hsl(var(--muted-foreground))] [&>span]:line-clamp-1 [&[data-state='open']>svg]:rotate-0",
          minimal &&
            "border-none bg-transparent p-0 text-[hsl(var(--foreground))] dark:bg-transparent dark:text-[hsl(var(--card-foreground))]"
        )}
      >
        <span className="capitalize">{defaultValue || "Time Period"}</span>
        <ChevronUpIcon className="size-4 rotate-180 transition-transform" />
      </DropdownTrigger>

      <DropdownContent
        align="end"
        className="min-w-[7rem] overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-1 font-medium text-[hsl(var(--muted-foreground))] shadow-[var(--shadow-md)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:border-[hsl(var(--sidebar-border))] dark:bg-[hsl(var(--card))] dark:text-[hsl(var(--muted-foreground))]"
      >
        <ul>
          {(items || (["monthly", "yearly"] as TItem[])).map((item) => (
            <li key={item}>
              <button
                type="button"
                className="flex w-full select-none items-center truncate rounded-[calc(var(--radius)*0.5)] px-3 py-2 text-sm capitalize outline-none hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] dark:hover:bg-[hsl(var(--secondary))] dark:hover:text-[hsl(var(--card-foreground))]"
                onClick={() => {
                  const queryString = createQueryString({
                    sectionKey,
                    value: item,
                    selectedTimeFrame: searchParams.get(PARAM_KEY),
                  });

                  router.push(pathname + queryString, { scroll: false });
                  setIsOpen(false);
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </DropdownContent>
    </Dropdown>
  );
}

const createQueryString = (props: {
  sectionKey: string;
  value: string;
  selectedTimeFrame: string | null;
}) => {
  const paramsValue = `${props.sectionKey}:${props.value}`;

  if (!props.selectedTimeFrame) {
    return `?${PARAM_KEY}=${paramsValue}`;
  }

  const newSearchParams = props.selectedTimeFrame
    .split(",")
    .filter((value) => !value.includes(props.sectionKey))
    .join(",");

  if (!newSearchParams) {
    return `?${PARAM_KEY}=${paramsValue}`;
  }

  return `?${PARAM_KEY}=${newSearchParams},${paramsValue}`;
};
