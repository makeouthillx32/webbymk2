'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { HeroSlideModal } from './HeroSlideModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { Plus, Eye, EyeOff, Edit2, Trash2, GripVertical, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type HeroSlide = {
  id: string;

  // Desktop image
  bucket_name: string;
  object_path: string;
  alt_text: string | null;

  // ✅ Mobile image (new)
  mobile_bucket_name: string; // default 'hero-images'
  mobile_object_path: string | null;
  mobile_alt_text: string | null;
  mobile_width: number | null;
  mobile_height: number | null;

  // Content overlay
  pill_text: string | null;
  headline_line1: string;
  headline_line2: string | null;
  subtext: string | null;

  // CTA buttons
  primary_button_label: string;
  primary_button_href: string;
  secondary_button_label: string | null;
  secondary_button_href: string | null;

  // Visual styling
  text_alignment: 'left' | 'center' | 'right';
  text_color: 'dark' | 'light';

  // Ordering & visibility
  position: number;
  is_active: boolean;

  // Technical metadata
  blurhash: string | null;
  width: number | null;
  height: number | null;

  created_at: string;
  updated_at: string;
};

export function HeroCarouselManager() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlide, setSelectedSlide] = useState<HeroSlide | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [draggedSlide, setDraggedSlide] = useState<HeroSlide | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchSlides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSlides() {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('hero_slides')
        .select('*')
        .order('position', { ascending: true });

      if (error) throw error;
      setSlides((data as HeroSlide[]) || []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load slides');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(slide: HeroSlide) {
    try {
      setError(null);
      const { error } = await supabase
        .from('hero_slides')
        .update({ is_active: !slide.is_active })
        .eq('id', slide.id);

      if (error) throw error;
      await fetchSlides();
    } catch (err: any) {
      setError(err.message ?? 'Failed to toggle slide');
    }
  }

  async function handleDelete() {
    if (!selectedSlide) return;

    try {
      setError(null);

      // ✅ Delete BOTH desktop + mobile assets (if present)
      const pathsToRemove: string[] = [];

      if (selectedSlide.object_path) {
        pathsToRemove.push(selectedSlide.object_path);
      }

      if (
        selectedSlide.mobile_object_path &&
        selectedSlide.mobile_object_path !== selectedSlide.object_path
      ) {
        pathsToRemove.push(selectedSlide.mobile_object_path);
      }

      // Desktop bucket (your schema uses same bucket by default)
      const bucket = selectedSlide.bucket_name || 'hero-images';

      if (pathsToRemove.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(bucket)
          .remove(pathsToRemove);

        if (storageError) throw storageError;
      }

      // Delete database record
      const { error: dbError } = await supabase
        .from('hero_slides')
        .delete()
        .eq('id', selectedSlide.id);

      if (dbError) throw dbError;

      setIsDeleteModalOpen(false);
      setSelectedSlide(null);
      await fetchSlides();
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete slide');
    }
  }

  async function handleReorder(newOrder: HeroSlide[]) {
    try {
      setError(null);
      const updates = newOrder.map((slide, index) => ({
        id: slide.id,
        position: index,
      }));

      // keep your current “simple loop” approach
      for (const update of updates) {
        const { error } = await supabase
          .from('hero_slides')
          .update({ position: update.position })
          .eq('id', update.id);

        if (error) throw error;
      }

      await fetchSlides();
    } catch (err: any) {
      setError(err.message ?? 'Failed to reorder slides');
    }
  }

  function handleDragStart(slide: HeroSlide) {
    setDraggedSlide(slide);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(targetSlide: HeroSlide) {
    if (!draggedSlide || draggedSlide.id === targetSlide.id) return;

    const newSlides = [...slides];
    const draggedIndex = newSlides.findIndex((s) => s.id === draggedSlide.id);
    const targetIndex = newSlides.findIndex((s) => s.id === targetSlide.id);

    const [removed] = newSlides.splice(draggedIndex, 1);
    newSlides.splice(targetIndex, 0, removed);

    handleReorder(newSlides);
    setDraggedSlide(null);
  }

  function getPublicUrl(bucketName: string, objectPath: string | null): string {
    if (!objectPath) return '';
    const { data } = supabase.storage.from(bucketName).getPublicUrl(objectPath);
    return data.publicUrl;
  }

  function getDesktopUrl(slide: HeroSlide) {
    return getPublicUrl(slide.bucket_name || 'hero-images', slide.object_path);
  }

  function getMobileUrl(slide: HeroSlide) {
    const bucket = slide.mobile_bucket_name || slide.bucket_name || 'hero-images';
    return getPublicUrl(bucket, slide.mobile_object_path);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading slides...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Slide
          </Button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--foreground))]">
              {slides.length} total
            </span>
            <span className="inline-flex items-center rounded-md bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
              {slides.filter((s) => s.is_active).length} active
            </span>
            <span className="inline-flex items-center rounded-md bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
              {slides.filter((s) => !!s.mobile_object_path).length} w/ mobile
            </span>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-[hsl(var(--destructive))]"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-[hsl(var(--destructive))]">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="flex-shrink-0 text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]/80"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Slides Grid */}
      {slides.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <svg
              className="h-16 w-16 text-[hsl(var(--muted-foreground))]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-[hsl(var(--foreground))]">
              No hero slides yet
            </h3>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Create your first hero slide to get started with the carousel
            </p>
            <Button onClick={() => setIsCreateModalOpen(true)} className="mt-6">
              <Plus className="mr-2 h-4 w-4" />
              Add First Slide
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {slides.map((slide) => {
            const desktopUrl = getDesktopUrl(slide);
            const mobileUrl = slide.mobile_object_path ? getMobileUrl(slide) : '';

            return (
              <Card
                key={slide.id}
                className={`group relative overflow-hidden transition-all ${
                  !slide.is_active ? 'opacity-60' : ''
                } ${draggedSlide?.id === slide.id ? 'ring-2 ring-[hsl(var(--primary))]' : ''}`}
                draggable
                onDragStart={() => handleDragStart(slide)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(slide)}
              >
                {/* Drag Handle */}
                <div className="absolute left-2 top-2 z-10 cursor-grab rounded-md bg-[hsl(var(--background))]/80 p-1.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <GripVertical className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                </div>

                {/* Position Badge */}
                <div className="absolute right-2 top-2 z-10 rounded-full bg-[hsl(var(--background))]/90 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--foreground))] backdrop-blur-sm">
                  #{slide.position + 1}
                </div>

                {/* Mobile Badge */}
                {slide.mobile_object_path && (
                  <div className="absolute right-2 top-10 z-10 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--background))]/90 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--foreground))] backdrop-blur-sm">
                    <Smartphone className="h-3.5 w-3.5" />
                    Mobile
                  </div>
                )}

                {/* Desktop Image Preview */}
                <div className="relative aspect-[21/9] overflow-hidden">
                  <img
                    src={desktopUrl}
                    alt={slide.alt_text || ''}
                    className="h-full w-full object-cover"
                  />
                  {!slide.is_active && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <span className="rounded-full bg-[hsl(var(--background))] px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        Inactive
                      </span>
                    </div>
                  )}
                </div>

                {/* Optional: Mobile preview strip */}
                {mobileUrl ? (
                  <div className="relative border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        Mobile image
                      </span>
                      {slide.mobile_width && slide.mobile_height ? (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          {slide.mobile_width}×{slide.mobile_height}
                        </span>
                      ) : null}
                    </div>
                    <div className="relative aspect-[375/490] overflow-hidden">
                      <img
                        src={mobileUrl}
                        alt={slide.mobile_alt_text || slide.alt_text || ''}
                        className="h-full w-full object-cover object-top"
                      />
                    </div>
                  </div>
                ) : null}

                {/* Content */}
                <CardContent className="p-4">
                  {slide.pill_text && (
                    <span className="mb-2 inline-block rounded-full bg-[hsl(var(--primary))]/10 px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--primary))]">
                      {slide.pill_text}
                    </span>
                  )}
                  <h3 className="line-clamp-1 font-semibold text-[hsl(var(--foreground))]">
                    {slide.headline_line1}
                  </h3>
                  {slide.headline_line2 && (
                    <h4 className="mt-1 line-clamp-1 text-sm text-[hsl(var(--muted-foreground))]">
                      {slide.headline_line2}
                    </h4>
                  )}
                  {slide.subtext && (
                    <p className="mt-2 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
                      {slide.subtext}
                    </p>
                  )}

                  {/* Metadata */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      {slide.text_alignment}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                      {slide.text_color} text
                    </span>
                    {slide.width && slide.height && (
                      <span className="inline-flex items-center rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        {slide.width}×{slide.height}
                      </span>
                    )}
                    {slide.mobile_object_path ? (
                      <span className="inline-flex items-center rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        mobile ✓
                      </span>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleToggleActive(slide)}
                      title={slide.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {slide.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setSelectedSlide(slide);
                        setIsEditModalOpen(true);
                      }}
                      title="Edit slide"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setSelectedSlide(slide);
                        setIsDeleteModalOpen(true);
                      }}
                      title="Delete slide"
                      className="text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10 hover:text-[hsl(var(--destructive))]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {isCreateModalOpen && (
        <HeroSlideModal
          mode="create"
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            fetchSlides();
          }}
        />
      )}

      {isEditModalOpen && selectedSlide && (
        <HeroSlideModal
          mode="edit"
          slide={selectedSlide}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedSlide(null);
          }}
          onSuccess={() => {
            setIsEditModalOpen(false);
            setSelectedSlide(null);
            fetchSlides();
          }}
        />
      )}

      {isDeleteModalOpen && selectedSlide && (
        <DeleteConfirmModal
          title="Delete Hero Slide"
          message={`Are you sure you want to delete the slide "${selectedSlide.headline_line1}"? This action cannot be undone and will also delete the image(s) from storage.`}
          onConfirm={handleDelete}
          onCancel={() => {
            setIsDeleteModalOpen(false);
            setSelectedSlide(null);
          }}
        />
      )}
    </div>
  );
}
