// app/dashboard/[id]/settings/research-products/_components/LoadingState.tsx
"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message = "Loading…" }: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-[hsl(var(--muted-foreground))]">
      <Loader2 size={20} className="animate-spin" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
