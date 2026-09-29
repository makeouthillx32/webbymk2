// src/components/shop/_components/HeroSlideOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The text/CTA overlay for a hero slide — ONE implementation, used by both the
// live storefront carousel and the dashboard's slide preview.
//
// This exists specifically so the preview cannot lie. If the editor drew its
// own approximation of the layout, the two would drift the moment either
// changed, and "make sure it renders right" would stop being answerable. Both
// call this, so what you position in the editor is literally what ships.
//
// `interactive` is the only difference between the two callers: the storefront
// renders real <Link>s, the preview renders inert <span>s (a preview shouldn't
// navigate, and nesting anchors inside the editor's own click targets is
// asking for trouble).
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { cn } from "@/lib/utils";

export type Align = "left" | "center" | "right";

/**
 * Theme tokens offered as overlay text colours.
 *
 * Deliberately CSS variables, never hex: the decoration then follows whatever
 * theme the zone is on. Hardcoded colour is exactly how the footer SVGs ended
 * up locked to a blue that matched no active theme.
 */
export const TEXT_COLOR_TOKENS = [
  { value: "foreground",       label: "Foreground (default text)" },
  { value: "primary",          label: "Primary" },
  { value: "accent",           label: "Accent" },
  { value: "muted-foreground", label: "Muted" },
  { value: "card-foreground",  label: "Card foreground" },
  { value: "destructive",      label: "Destructive" },
  { value: "background",       label: "Background (for dark art)" },
] as const;

export type TextColorToken = (typeof TEXT_COLOR_TOKENS)[number]["value"];

export const ALIGN_TEXT: Record<Align, string> = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

/** Vertical anchor for the overlay column. */
export const ALIGN_VERTICAL: Record<"top" | "center" | "bottom", string> = {
  top: "justify-start",
  center: "justify-center",
  bottom: "justify-end",
};

export const ALIGN_ROW: Record<Align, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

export type HeroOverlayFields = {
  pill_text?: string | null;
  headline_line1?: string | null;
  headline_line2?: string | null;
  subtext?: string | null;
  primary_button_label?: string | null;
  primary_button_href?: string | null;
  secondary_button_label?: string | null;
  secondary_button_href?: string | null;
  text_alignment?: Align | null;
  text_color?: "dark" | "light" | null;
  overlay_opacity?: number | null;
  cta_alignment?: "inherit" | Align | null;
  cta_underline?: boolean | null;
  cta_style?: "button" | "text" | null;
  /** Theme token for the TEXT. null = black/white from text_color. */
  text_color_token?: string | null;
  overlay_position?: "top" | "center" | "bottom" | null;
  overlay_pad_x?: number | null;
  overlay_pad_y?: number | null;
};

/** True when the slide has anything to draw. */
export function hasOverlayContent(s: HeroOverlayFields): boolean {
  return !!(
    s.pill_text ||
    s.headline_line1 ||
    s.headline_line2 ||
    s.subtext ||
    s.primary_button_label ||
    s.secondary_button_label
  );
}

/** Resolve the CTA row alignment — "inherit" tracks the text alignment. */
export function resolveCtaAlign(s: HeroOverlayFields): Align {
  const text = (s.text_alignment ?? "left") as Align;
  return !s.cta_alignment || s.cta_alignment === "inherit" ? text : s.cta_alignment;
}

export function HeroSlideOverlay({
  slide,
  interactive = true,
  scale = 1,
}: {
  slide: HeroOverlayFields;
  /** Storefront passes true (real links); the editor preview passes false. */
  interactive?: boolean;
  /** <1 shrinks type for small previews so proportions stay believable. */
  scale?: number;
}) {
  const textAlign = (slide.text_alignment ?? "left") as Align;
  const ctaAlign = resolveCtaAlign(slide);
  const light = slide.text_color === "light";
  // A token wins over the black/white default. The scrim still follows
  // text_color, so contrast behaviour is unchanged when only the text is tinted.
  const tokenColor = slide.text_color_token
    ? `hsl(var(--${slide.text_color_token}))`
    : undefined;
  const underline = slide.cta_underline === true;
  // "text" drops the pill entirely so the label sits on artwork that already
  // leaves a place for it.
  const asText = slide.cta_style === "text";
  const hasCta = !!(slide.primary_button_label || slide.secondary_button_label);

  const small = scale < 1;
  const vertical = (slide.overlay_position ?? "center") as "top" | "center" | "bottom";
  // Padding scales with the preview so a 24px inset reads proportionally the
  // same in the small editor preview as it does full-bleed on the storefront.
  const padX = Math.round((slide.overlay_pad_x ?? 24) * scale);
  const padY = Math.round((slide.overlay_pad_y ?? 24) * scale);

  const Btn = ({
    href,
    children,
    className,
  }: {
    href?: string | null;
    children: React.ReactNode;
    className: string;
  }) => {
    if (!interactive || !href) return <span className={className}>{children}</span>;
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  };

  return (
    <>
      {/* Scrim keeps text legible over a busy photo. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: light ? "#000" : "#fff",
          opacity: slide.overlay_opacity ?? 0.3,
        }}
      />

      <div
        className={cn(
          "absolute inset-0 flex flex-col",
          ALIGN_VERTICAL[vertical],
          small ? "gap-1" : "gap-3",
          ALIGN_TEXT[textAlign],
          // Only fall back to black/white when no token is set.
          !tokenColor && (light ? "text-white" : "text-black")
        )}
        style={{
          ...(tokenColor ? { color: tokenColor } : {}),
          // Scaled px rather than responsive classes: the whole point is that
          // where you place it in the editor is where it lands live, including
          // on mobile. Breakpoint-based padding would silently move it.
          paddingLeft: padX,
          paddingRight: padX,
          paddingTop: vertical === "bottom" ? 0 : padY,
          paddingBottom: vertical === "top" ? 0 : padY,
        }}
      >
        {slide.pill_text && (
          <span
            className={cn(
              "inline-flex w-fit rounded-full font-semibold backdrop-blur-sm",
              small ? "px-1.5 py-0.5 text-[7px]" : "px-3 py-1 text-xs",
              light ? "bg-white/20 text-white" : "bg-black/10 text-black"
            )}
          >
            {slide.pill_text}
          </span>
        )}

        {(slide.headline_line1 || slide.headline_line2) && (
          <h2
            className={cn(
              "font-bold leading-tight",
              small ? "text-[11px]" : "max-w-2xl text-2xl sm:text-4xl lg:text-5xl"
            )}
          >
            {slide.headline_line1}
            {slide.headline_line2 && (
              <>
                <br />
                {slide.headline_line2}
              </>
            )}
          </h2>
        )}

        {slide.subtext && (
          <p className={cn("opacity-90", small ? "text-[7px]" : "max-w-xl text-sm sm:text-base")}>
            {slide.subtext}
          </p>
        )}

        {hasCta && (
          <div
            className={cn(
              "flex w-full flex-wrap",
              small ? "mt-0.5 gap-1" : "mt-2 gap-3",
              ALIGN_ROW[ctaAlign]
            )}
          >
            {slide.primary_button_label && (
              <Btn
                href={slide.primary_button_href}
                className={cn(
                  "pointer-events-auto transition-all duration-300",
                  asText
                    ? cn(
                        "font-bold uppercase tracking-wider",
                        small ? "text-[8px]" : "text-sm sm:text-base",
                        underline
                          ? "border-b-2 border-current pb-0.5 hover:opacity-75 hover:tracking-widest"
                          : "hover:opacity-75"
                      )
                    : cn(
                        "rounded-xl bg-[hsl(var(--primary))] font-semibold text-[hsl(var(--primary-foreground))] shadow-sm hover:shadow-md hover:-translate-y-0.5",
                        small ? "px-2 py-0.5 text-[7px]" : "px-6 py-2.5 text-sm"
                      )
                )}
              >
                {slide.primary_button_label}
              </Btn>
            )}
            {slide.secondary_button_label && (
              <Btn
                href={slide.secondary_button_href}
                className={cn(
                  "pointer-events-auto transition-all duration-300",
                  asText
                    ? cn(
                        "font-bold uppercase tracking-wider opacity-80 hover:opacity-100",
                        small ? "text-[8px]" : "text-sm sm:text-base",
                        underline && "border-b-2 border-current pb-0.5 hover:tracking-widest"
                      )
                    : cn(
                        "rounded-xl border font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5",
                        small ? "px-2 py-0.5 text-[7px]" : "px-6 py-2.5 text-sm",
                        light
                          ? "border-white/70 text-white bg-white/10 backdrop-blur-sm"
                          : "border-black/40 text-black bg-black/5 backdrop-blur-sm"
                      )
                )}
              >
                {slide.secondary_button_label}
              </Btn>
            )}
          </div>
        )}
      </div>
    </>
  );
}
