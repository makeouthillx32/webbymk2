// app/settings/categories/_components/CategoryModal.tsx
"use client";

import { X } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
};

export function CategoryModal({
  open,
  title,
  description,
  children,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  // ESC to close + basic focus trap + restore focus
  useEffect(() => {
    if (!open) return;

    lastActiveRef.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;

      const focusables = panel.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      );

      // focus first focusable, otherwise focus panel itself
      (focusables[0] ?? panel).focus?.();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      // trap focus inside modal
      const panel = panelRef.current;
      if (!panel) return;

      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };

    // lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", onKeyDown);
    // focus after paint
    const t = window.setTimeout(focusFirst, 0);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;

      // restore focus
      lastActiveRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />

      {/* panel */}
      <div className="absolute left-1/2 top-1/2 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 -translate-y-1/2">
        <div
          ref={panelRef}
          tabIndex={-1}
          className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-lg)] outline-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-[hsl(var(--foreground))]">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-[hsl(var(--foreground))]" />
            </button>
          </div>

          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
