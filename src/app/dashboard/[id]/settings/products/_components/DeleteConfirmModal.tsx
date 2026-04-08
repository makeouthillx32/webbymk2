'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({ title, message, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(var(--foreground))/20]">
      <div className="bg-[hsl(var(--background))] rounded-[var(--radius)] shadow-[var(--shadow-lg)] max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center mb-4">
            <AlertTriangle size={24} className="text-[hsl(var(--destructive))] mr-3" />
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">{title}</h2>
          </div>
          
          <div className="mb-6">
            <p className="text-[hsl(var(--muted-foreground))]">{message}</p>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-[hsl(var(--border))] rounded-[var(--radius)] shadow-[var(--shadow-sm)] text-sm font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 border border-transparent rounded-[var(--radius)] shadow-[var(--shadow-sm)] text-sm font-medium text-[hsl(var(--destructive-foreground))] bg-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))/90] transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}