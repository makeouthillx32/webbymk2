// app/dashboard/[id]/settings/landing/_components/SortableSection.tsx
"use client";

import React, { useState } from "react";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Edit2, Trash2, Eye, EyeOff } from "lucide-react";
import type { LandingSectionRow } from "./types";
import "./landing.scss";

interface SortableSectionProps {
  section: LandingSectionRow;
  index: number;
  onEdit: () => void;
  onRefresh: () => void;
}

export function SortableSection({ section, index, onEdit, onRefresh }: SortableSectionProps) {
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  async function toggleActive() {
    setIsTogglingActive(true);
    try {
      const res = await fetch('/api/landing/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: section.id,
          is_active: !section.is_active,
        }),
      });

      if (res.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error('Failed to toggle active:', error);
    } finally {
      setIsTogglingActive(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this section? This cannot be undone.')) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/landing/sections?id=${section.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setIsDeleting(false);
    }
  }

  // Type-specific badge colors
  const typeColorClass = `type-badge type-${section.type}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-section ${!section.is_active ? 'inactive' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <div className="sortable-section__content">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="drag-handle"
          title="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Position Badge */}
        <div className="position-badge">
          {index + 1}
        </div>

        {/* Content */}
        <div className="section-info">
          <div className="section-info__header">
            <span className={typeColorClass}>
              {section.type}
            </span>
            
            {section.config?.title && (
              <span className="section-title">
                {section.config.title}
              </span>
            )}

            {section.config?.slug && (
              <span className="section-slug">
                /{section.config.slug}
              </span>
            )}
          </div>

          {/* Config Preview */}
          <div className="config-preview mono">
            {Object.keys(section.config || {}).length > 0
              ? Object.entries(section.config || {})
                  .slice(0, 3)
                  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                  .join(' • ')
              : 'No config'}
          </div>
        </div>

        {/* Actions */}
        <div className="section-actions">
          <button
            onClick={toggleActive}
            disabled={isTogglingActive}
            className={`action-btn ${section.is_active ? 'active-toggle on' : 'active-toggle off'}`}
            title={section.is_active ? 'Hide section' : 'Show section'}
          >
            {section.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          <button
            onClick={onEdit}
            className="action-btn edit-btn"
            title="Edit section"
          >
            <Edit2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="action-btn delete-btn"
            title="Delete section"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}