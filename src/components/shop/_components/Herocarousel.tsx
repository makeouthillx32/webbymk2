"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useViewport } from "@/hooks/use-viewport";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import {
  HeroSlideOverlay,
  hasOverlayContent,
  type Align,
} from "./HeroSlideOverlay";
import "./HeroCarousel.scss";

type HeroSlide = {
  id: string;
  desktop_image_url: string | null;
  mobile_image_url: string | null;
  alt_text: string | null;
  mobile_alt_text: string | null;
  primary_button_href: string;

  // Overlay content. These columns and the editor fields for them already
  // existed; until 2026-09-05 this component ignored every one of them and
  // rendered an image wrapped in a link. Now they render when show_overlay
  // is on — which defaults to false, so existing slides are unchanged.
  show_overlay?: boolean | null;
  pill_text?: string | null;
  headline_line1?: string | null;
  headline_line2?: string | null;
  subtext?: string | null;
  primary_button_label?: string | null;
  secondary_button_label?: string | null;
  secondary_button_href?: string | null;
  text_alignment?: Align | null;
  text_color?: "dark" | "light" | null;
  text_color_token?: string | null;
  overlay_opacity?: number | null;
  cta_alignment?: "inherit" | Align | null;
  cta_underline?: boolean | null;
  cta_style?: "button" | "text" | null;
  overlay_position?: "top" | "center" | "bottom" | null;
  overlay_pad_x?: number | null;
  overlay_pad_y?: number | null;
  target_device?: "all" | "desktop" | "mobile" | null;
};

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const { isMobile } = useViewport();
  const [api, setApi] = useState<CarouselApi | undefined>(undefined);
  const [current, setCurrent] = useState(0);

  // Filter slides by target_device:
  // - On mobile: show slides marked 'mobile' or 'all' (or unassigned).
  // - On desktop: show slides marked 'desktop' or 'all' (or unassigned).
  // Fall back to all slides with artwork if no device-specific slides exist.
  const activeSlides = useMemo(() => {
    const hasArt = slides.filter((s) => !!(s.desktop_image_url || s.mobile_image_url));
    if (isMobile === null) return hasArt;
    const matching = hasArt.filter((s) => {
      const target = s.target_device || "all";
      if (target === "all") return true;
      return isMobile ? target === "mobile" : target === "desktop";
    });
    return matching.length > 0 ? matching : hasArt;
  }, [slides, isMobile]);

  useEffect(() => {
    if (!api) return;

    api.scrollTo(0);
    setCurrent(0);

    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);

    return () => {
      // Embla supports off(); if your wrapper doesn’t, this still won’t crash,
      // but if it does support it, this prevents stacked listeners.
      api.off?.("select", onSelect);
    };
  }, [api, isMobile]);

  // Loading state placeholder (no fixed height to prevent jump)
  if (isMobile === null) return <div className="hero-carousel-container opacity-0" />;
  if (!activeSlides.length) return null;

  return (
    <section className="hero-carousel-container">
      <Carousel
        key={isMobile ? "viewport-mobile" : "viewport-desktop"}
        setApi={setApi}
        opts={{ loop: true, duration: 15 }}
      >
        <CarouselContent className="ml-0">
          {activeSlides.map((slide) => {
            const src = (isMobile ? slide.mobile_image_url : slide.desktop_image_url) || slide.desktop_image_url || slide.mobile_image_url;
            const alt = (isMobile ? slide.mobile_alt_text : slide.alt_text) || slide.alt_text || slide.mobile_alt_text || "Hero Image";

            if (!src) return null;




            const img = (
              <Image
                src={src}
                alt={alt}
                width={1920}
                height={1080}
                sizes="100vw"
                priority
                className="hero-img"
              />
            );

            // Image-only slide: unchanged from before — whole image is the link.
            if (!slide.show_overlay || !hasOverlayContent(slide)) {
              return (
                <CarouselItem key={slide.id} className="hero-slide-item">
                  <Link href={slide.primary_button_href} className="slide-link">
                    {img}
                  </Link>
                </CarouselItem>
              );
            }

            // Overlay slide. The image is NOT wrapped in a link here — nesting
            // the CTA anchors inside a full-bleed <a> is invalid HTML and makes
            // the buttons unclickable in some browsers. The buttons are the
            // links instead.
            return (
              <CarouselItem key={slide.id} className="hero-slide-item">
                <div className="slide-media relative">
                  {img}

                  <HeroSlideOverlay slide={slide} interactive />
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      <div className="dots-container">
        {activeSlides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => api?.scrollTo(i)}
            className={cn("dot", current === i && "active")}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
