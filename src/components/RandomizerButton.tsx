"use client";

import React from "react";

interface RandomizerButtonProps {
  onClick: () => void;
}

const RandomizerButton: React.FC<RandomizerButtonProps> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="p-2 rounded bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] hover:bg-[hsl(var(--sidebar-primary))]/90 transition-colors duration-200 shadow-[var(--shadow-sm)] font-medium"
  >
    Randomize Jobs
  </button>
);

export default RandomizerButton;