// app/dashboard/[id]/settings/roles/_components/ErrorAlert.tsx
'use client';

import React from 'react';
import { XCircle } from 'lucide-react';

interface ErrorAlertProps {
  message: string;
  onDismiss: () => void;
}

export default function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  return (
    <div className="bg-[hsl(var(--destructive))/0.1] text-[hsl(var(--destructive))] p-4 rounded-[var(--radius)] mb-6 flex items-start justify-between shadow-[var(--shadow-xs)]">
      <p>{message}</p>
      <button
        onClick={onDismiss}
        className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))/0.8] ml-4 transition-colors"
        title="Dismiss error"
      >
        <XCircle size={20} />
      </button>
    </div>
  );
}