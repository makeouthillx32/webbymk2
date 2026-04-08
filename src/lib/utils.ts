import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility to merge Tailwind CSS classes, intelligently handling conflicts.
 * Uses clsx for conditional class composition and twMerge to dedupe/override.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
