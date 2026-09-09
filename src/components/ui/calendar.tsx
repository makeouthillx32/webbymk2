"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  subMonths,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
} from "date-fns";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export interface CalendarProps {
  className?: string;
  classNames?: Record<string, string>;
  selected?: Date;
  onSelect?: (date: Date) => void;
  mode?: "single";
  required?: boolean;
}

export function Calendar({
  className,
  classNames,
  selected,
  onSelect,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(selected || new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const rows = [];
  let days = [];
  let day = startDate;

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const cloneDay = day;
      const isSelected = selected ? isSameDay(day, selected) : false;
      const isCurrentMonth = isSameMonth(day, monthStart);
      const isToday = isSameDay(day, new Date());

      days.push(
        <button
          key={day.toString()}
          type="button"
          onClick={() => onSelect?.(cloneDay)}
          className={cn(
            buttonVariants({ variant: isSelected ? "default" : "ghost" }),
            "h-8 w-8 p-0 font-normal text-xs",
            !isCurrentMonth && "text-muted-foreground opacity-50",
            isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            isToday && !isSelected && (classNames?.today || "font-bold text-accent-foreground")
          )}
        >
          <time dateTime={format(day, "yyyy-MM-dd")}>{format(day, "d")}</time>
        </button>
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div key={day.toString()} className="flex justify-between w-full mt-1">
        {days}
      </div>
    );
    days = [];
  }

  const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className={cn("p-3 select-none", className)}>
      <div className="flex items-center justify-between pt-1 relative pb-2">
        <span className="text-sm font-medium">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={prevMonth}
            className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex justify-between w-full text-xs text-muted-foreground py-1">
        {weekDays.map((d) => (
          <span key={d} className="w-8 text-center font-normal">
            {d}
          </span>
        ))}
      </div>
      <div className="flex flex-col">{rows}</div>
    </div>
  );
}
