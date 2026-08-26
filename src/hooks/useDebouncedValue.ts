"use client";
// hooks/useDebouncedValue.ts
// Delay a rapidly-changing value (search boxes, filter inputs) so effects that
// hit the network don't fire on every keystroke.

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
