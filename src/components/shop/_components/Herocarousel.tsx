"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useViewport } from "@/hooks/use-viewport";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import "./HeroCarousel.scss";

type HeroSlide = {
  id: string;
  desktop_image_url: string | null;
  mobile_image_url: string | null;
  alt_text: string | null;
  mobile_alt_text: string | null;
  primary_button_href: string;
};

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const { isMobile } = useViewport();
  const [api, setApi] = useState<CarouselApi | undefined>(undefined);
  const [current, setCurrent] = useState(0);

  const desktopSlides = useMemo(() => slides.filter((s) => !!s.desktop_image_url), [slides]);
  const mobileSlides = useMemo(() => slides.filter((s) => !!s.mobile_image_url), [slides]);

  // Prefer the viewport-specific set, but fall back if empty.
  const activeSlides = useMemo(() => {
    if (isMobile === true) return mobileSlides.length ? mobileSlides : desktopSlides;
    if (isMobile === false) return desktopSlides.length ? desktopSlides : mobileSlides;
    return [];
  }, [isMobile, mobileSlides, desktopSlides]);

  useEffect(() => {
    if (!api) return;

    api.scrollTo(0);
    setCurrent(0);

    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);

    return () => {
      // Embla supports off(); if your wrapper doesn’t, this still won’t crash,
      // but if it does support it, this prevents stacked listeners.
      // @ts-expect-error - depends on carousel wrapper typing
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

            return (
              <CarouselItem key={slide.id} className="hero-slide-item">
                <Link href={slide.primary_button_href} className="slide-link">
                  <Image
                    src={src}
                    alt={alt}
                    width={1920}
                    height={1080}
                    sizes="100vw"
                    priority
                    className="hero-img"
                  />
                </Link>
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
