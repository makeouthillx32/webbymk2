// components/shop/sections/CategoriesGridSection.tsx
"use client";

import type { SectionComponentProps } from "./SectionRegistry";
import {
  useTaxonomyCards,
  type TaxonomySource,
} from "@/components/shop/_components/useTaxonomyCards";
import Link from "next/link";
import Image from "next/image";
import {
  CardOverlaySlots,
  CardScrim,
  type CardOverlayStyle,
} from "@/components/shop/_components/CardOverlaySlots";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";


/**
 * A grid of taxonomy cards, each photo carrying up to five independently
 * placed text slots (see CardOverlaySlots). Copy comes from the category row,
 * placement from this section's config.
 */
import { cn } from "@/lib/utils";

function CategoryCard({
  card,
  style,
  sizes = "400px",
}: {
  card: TaxonomyCard;
  style: CardOverlayStyle;
  sizes?: string;
}) {
  return (
    <Link
      href={card.href}
      className="group relative block overflow-hidden rounded-xl aspect-square bg-[var(--sidebar)] w-full shadow-sm hover:shadow-md transition-shadow"
    >
      {card.coverImageUrl ? (
        <Image
          src={card.coverImageUrl}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          alt={card.cover_image_alt ?? card.name}
          sizes={sizes}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 via-neutral-900 to-stone-950 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0,transparent_75%)]" />
          <div className="absolute inset-0 flex items-center justify-center text-4xl sm:text-5xl font-black tracking-widest text-white/[0.03] uppercase select-none pointer-events-none px-6 text-center">
            {card.name}
          </div>
        </div>
      )}

      <CardScrim opacity={style.scrimOpacity} variant={style.scrimStyle} />
      <CardOverlaySlots card={card} style={style} />
    </Link>
  );
}

export default function CategoriesGridSection({ section }: SectionComponentProps) {
  // Which taxonomy this grid displays. Defaults to categories so every
  // existing section keeps rendering exactly what it rendered before.
  const source: TaxonomySource = section.config?.source === "collections" ? "collections" : "categories";
  const { cards, loading } = useTaxonomyCards(source);

  const title = section.config?.title ?? "Shop by Category";
  // `itemIds` is the source-agnostic key; `categoryIds` is what sections
  // written before the source switch used, and is still honoured.
  const selectedIds: string[] = section.config?.itemIds ?? section.config?.categoryIds ?? [];
  // Layout lives on the SECTION (this is where the final render happens); the
  // words live on each category row. Everything is optional — an unstyled grid
  // falls back to SLOT_DEFAULTS, which already reproduce the reference layout.
  const cardStyle: CardOverlayStyle = {
    slots:        section.config?.cardSlots,
    colorToken:   section.config?.cardColorToken,
    underline:    section.config?.cardUnderline,
    shadow:       section.config?.cardShadow,
    scrimOpacity: section.config?.cardScrimOpacity,
    scrimStyle:   section.config?.cardScrimStyle,
  };

  // An empty selection means "show everything in this taxonomy".
  // Preserve the editor's chosen ORDER rather than the table's position, so
  // dragging cards in the dashboard actually means something.
  const displayCards = selectedIds.length > 0
    ? selectedIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean) as typeof cards
    : cards;

  if (loading) {
    return (
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="h-10 bg-gray-200 rounded w-64 mx-auto mb-12 animate-pulse"></div>
          <div className="flex flex-col gap-6 md:hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-xl animate-pulse"></div>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 md:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
          {title}
        </h2>

        {/* Mobile: Vertical Stack */}
        <div className="md:hidden flex flex-col gap-6 max-w-md mx-auto">
          {displayCards.map((c) => (
            <CategoryCard
              key={c.id}
              card={c}
              style={cardStyle}
              sizes="(max-width: 768px) 100vw, 400px"
            />
          ))}
        </div>

        {/* Desktop/Tablet: Adaptive Grid when <= 3, Carousel when > 3 */}
        {displayCards.length <= 3 ? (
          <div
            className={cn(
              "hidden md:grid gap-6 mx-auto",
              displayCards.length === 1 && "max-w-xs grid-cols-1",
              displayCards.length === 2 && "max-w-2xl grid-cols-2",
              displayCards.length === 3 && "max-w-5xl grid-cols-3"
            )}
          >
            {displayCards.map((c) => (
              <CategoryCard key={c.id} card={c} style={cardStyle} />
            ))}
          </div>
        ) : (
          <div className="hidden md:block max-w-5xl mx-auto relative px-4">
            <Carousel
              opts={{
                align: "start",
                loop: false,
              }}
              className="w-full"
            >
              <CarouselContent className="-ml-4">
                {displayCards.map((c) => (
                  <CarouselItem key={c.id} className="pl-4 md:basis-1/2 lg:basis-1/3">
                    <CategoryCard card={c} style={cardStyle} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="-left-4 lg:-left-6 shadow-md bg-background/90 backdrop-blur-sm hover:bg-background" />
              <CarouselNext className="-right-4 lg:-right-6 shadow-md bg-background/90 backdrop-blur-sm hover:bg-background" />
            </Carousel>
          </div>
        )}

        {!loading && displayCards.length === 0 ? (
          <div className="text-center text-sm text-[var(--muted-foreground)] py-12">
            {selectedIds.length > 0
              ? `No matching ${source} found. Check this section's selection.`
              : `Nothing in ${source} yet. Add some in Dashboard → Settings → Taxonomy.`}
          </div>
        ) : null}
      </div>
    </section>
  );
}