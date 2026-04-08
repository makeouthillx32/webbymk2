// components/home/_components/BackButton.tsx
import React, { MouseEvent } from 'react';
import { FiArrowLeft } from 'react-icons/fi';

interface BackButtonProps {
  /** callback: navigateTo(pageKey)(event) */
  navigateTo: (page: string) => (e?: MouseEvent) => void;
  /** where to navigate back; defaults to "home" */
  backKey?: string;
  /** optional custom label text */
  label?: string;
}

/**
 * Renders a back button that calls navigateTo(backKey).
 * Defaults to "home" and label "Back to Home" if no props.
 */
const BackButton: React.FC<BackButtonProps> = ({
  navigateTo,
  backKey = 'home',
  label,
}) => {
  const displayLabel = label ||
    `Back to ${backKey.charAt(0).toUpperCase() + backKey.slice(1)}`;

  return (
    <div className="mb-4">
      <button
        onClick={navigateTo(backKey)}
        className="flex items-center gap-1 text-[var(--accent)] text-sm underline hover:opacity-80"
      >
        <FiArrowLeft /> {displayLabel}
      </button>
    </div>
  );
};

export default BackButton;
