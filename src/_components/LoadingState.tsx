// app/dashboard/[id]/settings/roles/_components/LoadingState.tsx
'use client';

import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="text-center py-8">
      <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--sidebar-primary))] border-t-transparent rounded-full mx-auto mb-4 shadow-[var(--shadow-xs)]"></div>
      <p className="text-[hsl(var(--muted-foreground))] font-[var(--font-sans)]">{message}</p>
    </div>
  );
}