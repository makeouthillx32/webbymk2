"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export interface HeroSlide {
  id: string;
  // Images
  desktop_image_url: string | null;
  mobile_image_url: string | null;
  // Text content
  pill_text: string | null;
  headline_line1: string;
  headline_line2: string | null;
  subtext: string | null;
  // Buttons
  primary_button_label: string;
  primary_button_href: string;
  secondary_button_label: string | null;
  secondary_button_href: string | null;
  // Accessibility & Styling
  alt_text: string | null;
  mobile_alt_text: string | null;
  text_alignment: "left" | "center" | "right";
  text_color: "dark" | "light";
  // Metadata
  blurhash: string | null;
  width: number | null;
  height: number | null;
  mobile_width: number | null;
  mobile_height: number | null;
}

export function useHeroSlides() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSlides() {
      try {
        const supabase = createClient();

        const { data, error: fetchError } = await supabase
          .from("hero_slides")
          .select("*")
          .eq("is_active", true)
          .order("position", { ascending: true });

        if (fetchError) {
          setError(fetchError.message);
          setSlides([]);
          return;
        }

        const slidesWithUrls = (data || []).map((slide) => {
          let desktopUrl: string | null = null;
          let mobileUrl: string | null = null;

          if (slide.object_path) {
            const { data: dData } = supabase.storage
              .from(slide.bucket_name)
              .getPublicUrl(slide.object_path);
            desktopUrl = dData.publicUrl;
          }

          if (slide.mobile_object_path) {
            const { data: mData } = supabase.storage
              .from(slide.mobile_bucket_name || slide.bucket_name)
              .getPublicUrl(slide.mobile_object_path);
            mobileUrl = mData.publicUrl;
          }

          return {
            id: slide.id,
            desktop_image_url: desktopUrl,
            mobile_image_url: mobileUrl,
            pill_text: slide.pill_text,
            headline_line1: slide.headline_line1,
            headline_line2: slide.headline_line2,
            subtext: slide.subtext,
            primary_button_label: slide.primary_button_label,
            primary_button_href: slide.primary_button_href,
            secondary_button_label: slide.secondary_button_label,
            secondary_button_href: slide.secondary_button_href,
            alt_text: slide.alt_text ?? null,
            mobile_alt_text: slide.mobile_alt_text ?? slide.alt_text ?? null,
            text_alignment: slide.text_alignment,
            text_color: slide.text_color,
            blurhash: slide.blurhash,
            width: slide.width,
            height: slide.height,
            mobile_width: slide.mobile_width,
            mobile_height: slide.mobile_height,
          };
        });

        setSlides(slidesWithUrls);
      } catch (err) {
        setError("Failed to load hero carousel");
        setSlides([]);
      } finally {
        setLoading(false);
      }
    }

    fetchSlides();
  }, []);

  return { slides, loading, error };
}