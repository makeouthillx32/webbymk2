// settings/landing/_components/DeleteConfirmModal.tsx
"use client";

import React from "react";

export default function DeleteConfirmModal({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "Delete",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmText?: string;
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={() => onOpenChange(false)}>
      <div className="modal modal-sm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {description ? <div className="modal-subtitle">{description}</div> : null}
          </div>
          <button className="iconbtn" onClick={() => onOpenChange(false)} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
