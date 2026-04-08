'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon, Smartphone, Trash2 } from 'lucide-react';

type HeroSlide = {
  id: string;

  // Desktop image
  bucket_name: string;
  object_path: string;
  alt_text: string | null;

  // ✅ Mobile image (new)
  mobile_bucket_name?: string; // default 'hero-images'
  mobile_object_path?: string | null;
  mobile_alt_text?: string | null;
  mobile_width?: number | null;
  mobile_height?: number | null;

  pill_text: string | null;
  headline_line1: string;
  headline_line2: string | null;
  subtext: string | null;
  primary_button_label: string;
  primary_button_href: string;
  secondary_button_label: string | null;
  secondary_button_href: string | null;
  text_alignment: 'left' | 'center' | 'right';
  text_color: 'dark' | 'light';
  position: number;
  is_active: boolean;
};

type Props = {
  mode: 'create' | 'edit';
  slide?: HeroSlide;
  onClose: () => void;
  onSuccess: () => void;
};

const DESKTOP_RECOMMENDED_WIDTH = 2880;
const DESKTOP_RECOMMENDED_HEIGHT = 1050;

// ✅ from your Canva / LoveBonito mobile style
const MOBILE_RECOMMENDED_WIDTH = 1125;
const MOBILE_RECOMMENDED_HEIGHT = 1470;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET = 'hero-images';

function safeExt(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : 'jpg';
}

export function HeroSlideModal({ mode, slide, onClose, onSuccess }: Props) {
  const supabase = createClient();

  const [formData, setFormData] = useState({
    pill_text: slide?.pill_text || '',
    headline_line1: slide?.headline_line1 || '',
    headline_line2: slide?.headline_line2 || '',
    subtext: slide?.subtext || '',
    primary_button_label: slide?.primary_button_label || 'Shop Now',
    primary_button_href: slide?.primary_button_href || '/shop',
    secondary_button_label: slide?.secondary_button_label || '',
    secondary_button_href: slide?.secondary_button_href || '',
    alt_text: slide?.alt_text || '',
    text_alignment: (slide?.text_alignment || 'left') as 'left' | 'center' | 'right',
    text_color: (slide?.text_color || 'dark') as 'dark' | 'light',
    is_active: slide?.is_active ?? true,

    // ✅ mobile alt text input
    mobile_alt_text: slide?.mobile_alt_text || '',
    target_device: (slide?.target_device || 'all') as 'all' | 'desktop' | 'mobile',
  });

  // Desktop image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // ✅ Mobile image
  const [mobileImageFile, setMobileImageFile] = useState<File | null>(null);
  const [mobileImagePreview, setMobileImagePreview] = useState<string | null>(null);
  const [mobileImageDimensions, setMobileImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [removeMobile, setRemoveMobile] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileFileInputRef = useRef<HTMLInputElement>(null);

  // ✅ When editing, show current images even before selecting new ones
  useEffect(() => {
    if (mode !== 'edit' || !slide) return;

    // Desktop existing
    if (!imagePreview && slide.object_path) {
      const { data } = supabase.storage.from(slide.bucket_name || BUCKET).getPublicUrl(slide.object_path);
      setImagePreview(data.publicUrl);
    }

    // Mobile existing
    if (!mobileImagePreview && slide.mobile_object_path) {
      const bucket = slide.mobile_bucket_name || slide.bucket_name || BUCKET;
      const { data } = supabase.storage.from(bucket).getPublicUrl(slide.mobile_object_path);
      setMobileImagePreview(data.publicUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, slide]);

  function validateImage(file: File) {
    if (!file.type.startsWith('image/')) return 'Please select an image file';
    if (file.size > MAX_FILE_SIZE) return 'Image must be smaller than 10MB';
    return null;
  }

  function readDimsAndPreview(file: File, setDims: any, setPreview: any, recommended: { w: number; h: number }) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setDims({ width: img.width, height: img.height });
        if (img.width !== recommended.w || img.height !== recommended.h) {
          setError(
            `⚠️ Recommended size is ${recommended.w}×${recommended.h}px. Your image is ${img.width}×${img.height}px.`
          );
        } else {
          setError(null);
        }
      };
      setPreview(ev.target?.result as string);
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const v = validateImage(file);
    if (v) return setError(v);

    setError(null);
    setImageFile(file); // Fixed placeholder
    readDimsAndPreview(file, setImageDimensions, setImagePreview, {
      w: DESKTOP_RECOMMENDED_WIDTH,
      h: DESKTOP_RECOMMENDED_HEIGHT,
    });
  }

  function handleMobileImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const v = validateImage(file);
    if (v) return setError(v);

    setError(null);
    setRemoveMobile(false); // uploading a new mobile image overrides “remove”
    setMobileImageFile(file);
    readDimsAndPreview(
      file,
      setMobileImageDimensions,
      setMobileImagePreview,
      { w: MOBILE_RECOMMENDED_WIDTH, h: MOBILE_RECOMMENDED_HEIGHT }
    );
  }

  async function uploadToBucket(path: string, file: File) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUploading(true);
    setError(null);

    try {
      // -------------------
      // Desktop image path
      // -------------------
      let objectPath = slide?.object_path || '';

      if (imageFile) {
        const fileExt = safeExt(imageFile.name);
        const fileName = `slide-${Date.now()}.${fileExt}`;
        const filePath = `slides/${fileName}`;

        await uploadToBucket(filePath, imageFile);
        objectPath = filePath;

        // delete old desktop image on edit
        if (mode === 'edit' && slide?.object_path) {
          await supabase.storage.from(BUCKET).remove([slide.object_path]);
        }
      } else if (mode === 'create') {
        throw new Error('Please select a desktop hero image');
      }

      // -------------------
      // ✅ Mobile image path
      // -------------------
      let mobileObjectPath: string | null = slide?.mobile_object_path ?? null;

      // if user explicitly removed mobile image
      if (removeMobile) {
        mobileObjectPath = null;

        if (mode === 'edit' && slide?.mobile_object_path) {
          await supabase.storage.from(BUCKET).remove([slide.mobile_object_path]);
        }
      }

      // if user uploaded a new mobile image
      if (mobileImageFile) {
        const fileExt = safeExt(mobileImageFile.name);
        const fileName = `slide-mobile-${Date.now()}.${fileExt}`;
        const filePath = `slides/mobile/${fileName}`;

        await uploadToBucket(filePath, mobileImageFile);
        mobileObjectPath = filePath;

        // delete old mobile image on edit (if existed)
        if (mode === 'edit' && slide?.mobile_object_path) {
          await supabase.storage.from(BUCKET).remove([slide.mobile_object_path]);
        }
      }

      const payload: any = {
        // Desktop Image Data
        bucket_name: BUCKET,
        object_path: objectPath,
        alt_text: formData.alt_text || null,
        width: imageDimensions?.width || slide?.width || null,
        height: imageDimensions?.height || slide?.height || null,
        
        target_device: formData.target_device,

        // Content overlay
        pill_text: formData.pill_text || null,
        headline_line1: formData.headline_line1,
        headline_line2: formData.headline_line2 || null,
        subtext: formData.subtext || null,

        // CTA
        primary_button_label: formData.primary_button_label,
        primary_button_href: formData.primary_button_href,
        secondary_button_label: formData.secondary_button_label || null,
        secondary_button_href: formData.secondary_button_href || null,

        // Styling / status
        text_alignment: formData.text_alignment,
        text_color: formData.text_color,
        is_active: formData.is_active,

        // Mobile columns
        mobile_bucket_name: BUCKET,
        mobile_object_path: mobileObjectPath,
        mobile_alt_text: formData.mobile_alt_text || null,
        mobile_width: mobileImageDimensions?.width || (removeMobile ? null : slide?.mobile_width ?? null),
        mobile_height: mobileImageDimensions?.height || (removeMobile ? null : slide?.mobile_height ?? null),
      };

      if (mode === 'create') {
        const { data: maxData } = await supabase
          .from('hero_slides')
          .select('position')
          .order('position', { ascending: false })
          .limit(1);

        const nextPosition = (maxData?.[0]?.position ?? -1) + 1;

        const { error: insertError } = await supabase
          .from('hero_slides')
          .insert({ ...payload, position: nextPosition });

        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase
          .from('hero_slides')
          .update(payload)
          .eq('id', slide!.id);

        if (updateError) throw updateError;
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-6">
          <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
            {mode === 'create' ? 'Add New Hero Slide' : 'Edit Hero Slide'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form id="__hero_slide_form__" onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Alert */}
          {error && (
            <div
              className={`rounded-lg border p-4 ${
                error.startsWith('⚠️')
                  ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-500/20 dark:bg-yellow-500/10'
                  : 'border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10'
              }`}
            >
              <p
                className={`text-sm ${
                  error.startsWith('⚠️')
                    ? 'text-yellow-800 dark:text-yellow-200'
                    : 'text-[hsl(var(--destructive))]'
                }`}
              >
                {error}
              </p>
            </div>
          )}

          {/* Desktop Image Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Desktop Hero Image *
            </label>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Recommended: {DESKTOP_RECOMMENDED_WIDTH}×{DESKTOP_RECOMMENDED_HEIGHT}px • Max 10MB
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />

            {imagePreview ? (
              <div className="relative aspect-[21/9] overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                <img src={imagePreview} alt="Desktop Preview" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Change Image
                  </Button>
                </div>
                {imageDimensions && (
                  <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white backdrop-blur-sm">
                    {imageDimensions.width} × {imageDimensions.height}px
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-12 transition-colors hover:bg-[hsl(var(--muted))]/50"
              >
                <ImageIcon className="h-12 w-12 text-[hsl(var(--muted-foreground))]" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">Click to upload image</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">PNG, JPG, WEBP up to 10MB</p>
                </div>
              </button>
            )}
          </div>

          {/* ✅ Mobile Image Upload */}
          <div className="space-y-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
                  <Smartphone className="h-4 w-4" />
                  Mobile Hero Image (Recommended)
                </label>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  Recommended: {MOBILE_RECOMMENDED_WIDTH}×{MOBILE_RECOMMENDED_HEIGHT}px • Used on mobile to match the reference layout
                </p>
              </div>

              {mode === 'edit' && (slide?.mobile_object_path || mobileImageFile) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // if they uploaded a new mobile file, just clear it
                    if (mobileImageFile) {
                      setMobileImageFile(null);
                      // restore preview to existing image if any
                      if (slide?.mobile_object_path) {
                        const bucket = slide.mobile_bucket_name || slide.bucket_name || BUCKET;
                        const { data } = supabase.storage.from(bucket).getPublicUrl(slide.mobile_object_path);
                        setMobileImagePreview(data.publicUrl);
                        setMobileImageDimensions(null);
                      } else {
                        setMobileImagePreview(null);
                        setMobileImageDimensions(null);
                      }
                    } else {
                      // mark to remove existing on save
                      setRemoveMobile(true);
                      setMobileImageFile(null);
                      setMobileImagePreview(null);
                      setMobileImageDimensions(null);
                    }
                  }}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              ) : null}
            </div>

            <input
              ref={mobileFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleMobileImageSelect}
              className="hidden"
            />

            {mobileImagePreview ? (
              <div className="space-y-3">
                <div className="relative aspect-[375/490] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-black/5">
                  <img
                    src={mobileImagePreview}
                    alt="Mobile Preview"
                    className="h-full w-full object-cover object-top"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
                    <Button type="button" variant="secondary" size="sm" onClick={() => mobileFileInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />
                      Change Mobile
                    </Button>
                  </div>
                  {mobileImageDimensions && (
                    <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white backdrop-blur-sm">
                      {mobileImageDimensions.width} × {mobileImageDimensions.height}px
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="mobile_alt_text" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                    Mobile Alt Text (SEO)
                  </label>
                  <input
                    id="mobile_alt_text"
                    type="text"
                    className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                    value={formData.mobile_alt_text}
                    onChange={(e) => setFormData({ ...formData, mobile_alt_text: e.target.value })}
                    placeholder="Mobile hero image description"
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRemoveMobile(false);
                  mobileFileInputRef.current?.click();
                }}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-8 transition-colors hover:bg-[hsl(var(--muted))]/30"
              >
                <Smartphone className="h-10 w-10 text-[hsl(var(--muted-foreground))]" />
                <div className="text-center">
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                    Click to upload a mobile hero image
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Optional — but required to match LoveBonito-style mobile layout
                  </p>
                </div>
              </button>
            )}

            {removeMobile ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Mobile image will be removed when you save.
              </p>
            ) : null}
          </div>

          {/* Target Device Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
              Display On
            </label>
            <div className="flex gap-2">
              {(['all', 'desktop', 'mobile'] as const).map((device) => (
                <button
                  key={device}
                  type="button"
                  onClick={() => setFormData({ ...formData, target_device: device })}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize transition-all ${
                    formData.target_device === device
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                      : 'border-[hsl(var(--input))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))]/50'
                  }`}
                >
                  {device}
                </button>
              ))}
            </div>
          </div>

          {/* Text Overlay Section (unchanged) */}
          <div className="space-y-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4">
            <h3 className="font-semibold text-[hsl(var(--foreground))]">Text Overlay</h3>

            <div className="space-y-2">
              <label htmlFor="pill_text" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Pill Text (Optional)
              </label>
              <input
                id="pill_text"
                type="text"
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={formData.pill_text}
                onChange={(e) => setFormData({ ...formData, pill_text: e.target.value })}
                placeholder="Desert Cowgirl • Western-inspired"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="headline_line1" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Headline Line 1 *
              </label>
              <input
                id="headline_line1"
                type="text"
                required
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={formData.headline_line1}
                onChange={(e) => setFormData({ ...formData, headline_line1: e.target.value })}
                placeholder="Where Desert Meets Style"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="headline_line2" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Headline Line 2 (Optional)
              </label>
              <input
                id="headline_line2"
                type="text"
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={formData.headline_line2}
                onChange={(e) => setFormData({ ...formData, headline_line2: e.target.value })}
                placeholder="Authentic Western Fashion"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="subtext" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Subtext (Optional)
              </label>
              <textarea
                id="subtext"
                rows={2}
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={formData.subtext}
                onChange={(e) => setFormData({ ...formData, subtext: e.target.value })}
                placeholder="Discover timeless pieces for the modern cowgirl"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="alt_text" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Alt Text (SEO)
              </label>
              <input
                id="alt_text"
                type="text"
                className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                value={formData.alt_text}
                onChange={(e) => setFormData({ ...formData, alt_text: e.target.value })}
                placeholder="Woman in western boots and denim"
              />
            </div>
          </div>

          {/* Text Styling (unchanged) */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Text Alignment
              </label>
              <div className="flex gap-2">
                {(['left', 'center', 'right'] as const).map((alignment) => (
                  <label
                    key={alignment}
                    className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm transition-colors hover:bg-[hsl(var(--muted))]/50 has-[:checked]:border-[hsl(var(--ring))] has-[:checked]:bg-[hsl(var(--primary))]/10 has-[:checked]:text-[hsl(var(--primary))]"
                  >
                    <input
                      type="radio"
                      name="text_alignment"
                      value={alignment}
                      checked={formData.text_alignment === alignment}
                      onChange={(e) => setFormData({ ...formData, text_alignment: e.target.value as any })}
                      className="sr-only"
                    />
                    <span className="capitalize">{alignment}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">
                Text Color
              </label>
              <div className="flex gap-2">
                {(['dark', 'light'] as const).map((color) => (
                  <label
                    key={color}
                    className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm transition-colors hover:bg-[hsl(var(--muted))]/50 has-[:checked]:border-[hsl(var(--ring))] has-[:checked]:bg-[hsl(var(--primary))]/10 has-[:checked]:text-[hsl(var(--primary))]"
                  >
                    <input
                      type="radio"
                      name="text_color"
                      value={color}
                      checked={formData.text_color === color}
                      onChange={(e) => setFormData({ ...formData, text_color: e.target.value as any })}
                      className="sr-only"
                    />
                    <span className="capitalize">{color}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* CTA (unchanged) */}
          <div className="space-y-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4">
            <h3 className="font-semibold text-[hsl(var(--foreground))]">Call-to-Action Buttons</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="primary_button_label" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                  Primary Button Label *
                </label>
                <input
                  id="primary_button_label"
                  type="text"
                  required
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                  value={formData.primary_button_label}
                  onChange={(e) => setFormData({ ...formData, primary_button_label: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="primary_button_href" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                  Primary Button Link *
                </label>
                <input
                  id="primary_button_href"
                  type="text"
                  required
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                  value={formData.primary_button_href}
                  onChange={(e) => setFormData({ ...formData, primary_button_href: e.target.value })}
                  placeholder="/shop"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="secondary_button_label" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                  Secondary Button Label (Optional)
                </label>
                <input
                  id="secondary_button_label"
                  type="text"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                  value={formData.secondary_button_label}
                  onChange={(e) => setFormData({ ...formData, secondary_button_label: e.target.value })}
                  placeholder="New Releases"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="secondary_button_href" className="block text-sm font-medium text-[hsl(var(--foreground))]">
                  Secondary Button Link
                </label>
                <input
                  id="secondary_button_href"
                  type="text"
                  className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
                  value={formData.secondary_button_href}
                  onChange={(e) => setFormData({ ...formData, secondary_button_href: e.target.value })}
                  placeholder="/collections/new-releases"
                  disabled={!formData.secondary_button_label}
                />
              </div>
            </div>
          </div>

          {/* Status */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-[hsl(var(--input))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
            />
            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
              Active (visible in carousel)
            </span>
          </label>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[hsl(var(--border))] p-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="__hero_slide_form__" onClick={handleSubmit} disabled={uploading}>
            {uploading ? 'Uploading...' : mode === 'create' ? 'Create Slide' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
