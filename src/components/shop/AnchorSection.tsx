// components/AnchorSection.tsx
import React, { ReactNode, MouseEvent, ElementType } from "react";
import { FiArrowLeft } from "react-icons/fi";

interface AnchorSectionProps {
  /** hash link – what comes after the # in /page#hash */
  id: string;
  /** optional label for screen‑readers (defaults to the id) */
  label?: string;
  children?: ReactNode;
  className?: string;
  /** HTML tag or component type to render (defaults to <section>) */
  as?: ElementType;
  /** optional navigate helper for a back button */
  navigateTo?: (page: string) => (e?: MouseEvent) => void;
  /** if provided, renders a “Back to …” button that calls navigateTo(backKey) */
  backKey?: string;
  /** optional override for back button text */
  backLabel?: string;
}

/**
 * A reusable in‑page anchor. Renders an element with the given id so any
 * link to “/#id” scrolls here. If `backKey` is supplied, shows a button that
 * calls `navigateTo(backKey)`.
 */
export default function AnchorSection({
  id,
  label,
  children,
  className = "",
  as: Tag = "section",
  navigateTo,
  backKey,
  backLabel,
}: AnchorSectionProps) {
  return (
    <Tag id={id} className={className}>
      {/* hidden text for screen‑readers */}
      <span className="sr-only">{label ?? id} anchor</span>

      {/* optional back button */}
      {backKey && navigateTo && (
        <div className="mb-4">
          <button
            onClick={navigateTo(backKey)}
            className="flex items-center gap-1 text-[var(--accent)] text-sm underline hover:opacity-80"
          >
            <FiArrowLeft /> {backLabel || `Back to ${label ?? backKey}`}
          </button>
        </div>
      )}

      {children}
    </Tag>
  );
}
