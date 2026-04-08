// app/dashboard/[id]/settings/landing/_components/LandingManager.tsx
"use client";

import React, { useState, useCallback } from "react";
import { useLandingSections } from "./useLandingSections";
import { Plus, RefreshCw } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableSection } from "./SortableSection";
import { CreateSectionModal } from "./CreateSectionModal";
import { EditSectionModal } from "./EditSectionModal";
import type { LandingSectionRow } from "./types";

export default function LandingManager() {
  const { sections, loading, error, refresh, updatePositions } = useLandingSections();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<LandingSectionRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(async (event: any) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sections, oldIndex, newIndex);
    
    // Update positions in database
    await updatePositions(reordered);
  }, [sections, updatePositions]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto mb-4"></div>
          <p className="text-sm text-[var(--muted-foreground)]">Loading sections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Landing Page</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Drag to reorder sections • Toggle to show/hide
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Section
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Sections List */}
      <div className="space-y-3">
        {sections.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-lg">
            <p className="text-[var(--muted-foreground)] mb-4">No sections yet</p>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Your First Section
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section, index) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  index={index}
                  onEdit={() => setEditingSection(section)}
                  onRefresh={refresh}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Modals */}
      <CreateSectionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={refresh}
      />

      <EditSectionModal
        open={!!editingSection}
        section={editingSection}
        onClose={() => setEditingSection(null)}
        onSuccess={refresh}
      />
    </div>
  );
}