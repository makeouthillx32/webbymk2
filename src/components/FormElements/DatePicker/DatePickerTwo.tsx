"use client";

import { ChevronUpIcon } from "@/assets/icons";
import flatpickr from "flatpickr";
import { useEffect } from "react";

const DatePickerTwo = () => {
  useEffect(() => {
    // Init flatpickr
    flatpickr(".form-datepicker", {
      mode: "single",
      static: true,
      monthSelectorType: "static",
      dateFormat: "M j, Y",
    });
  }, []);

  return (
    <div>
      <label className="mb-3 block text-body-sm font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--foreground))]">
        Select date
      </label>
      <div className="relative">
        <input
          className="form-datepicker w-full rounded-[calc(var(--radius)*0.875)] border-[1.5px] border-[hsl(var(--border))] bg-transparent px-5 py-3 font-normal outline-none transition focus:border-[hsl(var(--sidebar-primary))] active:border-[hsl(var(--sidebar-primary))] dark:border-[hsl(var(--border))] dark:bg-[hsl(var(--secondary))] dark:focus:border-[hsl(var(--sidebar-primary))]"
          placeholder="mm/dd/yyyy"
          data-class="flatpickr-right"
        />

        <div className="pointer-events-none absolute inset-0 left-auto right-5 flex items-center text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))]">
          <ChevronUpIcon className="rotate-180" />
        </div>
      </div>
    </div>
  );
};

export default DatePickerTwo;