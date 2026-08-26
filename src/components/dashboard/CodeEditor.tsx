"use client";
// components/dashboard/CodeEditor.tsx
// ─────────────────────────────────────────────────────────────────────────────
// IDE-style highlighted editor that stays a REAL <textarea>.
//
// Technique: a syntax-colored <pre> sits absolutely behind a textarea whose
// text is transparent (caret and selection remain visible). Both layers share
// identical font metrics, padding and wrapping, so glyphs align 1:1. The
// textarea keeps every native behavior that matters on mobile — iOS callout
// paste, autoscroll-to-caret, selection handles — which is why this beats a
// contenteditable for a phone-first editor.
//
// Invariants:
//  • METRICS must be identical on both layers — any divergence skews the caret.
//  • The highlight function must return HTML whose text content equals the
//    source exactly (see lib/editor/markdownHighlight.ts).
//  • 16px font on mobile is deliberate: below 16px iOS zooms the page on focus.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { cn } from "@/utils/cn";

const METRICS =
  "whitespace-pre-wrap break-words p-3 font-mono text-[16px] leading-relaxed md:text-[13px]";

export interface CodeEditorProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onValueChange: (next: string) => void;
  /** Source → HTML. Memoized here; pass a stable reference. */
  highlight: (source: string) => string;
  /** External ref (e.g. useTextInsertion) that needs the real textarea node. */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  wrapperClassName?: string;
}

export function CodeEditor({
  value,
  onValueChange,
  highlight,
  textareaRef,
  wrapperClassName,
  className,
  ...rest
}: CodeEditorProps) {
  const preRef = React.useRef<HTMLPreElement>(null);

  const html = React.useMemo(() => highlight(value), [highlight, value]);

  // Keep the overlay locked to the textarea's scroll position. The overlay has
  // overflow:hidden, but scrollTop is still writable when content overflows.
  const syncScroll = React.useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
    const area = event.currentTarget;
    const pre = preRef.current;
    if (pre) {
      pre.scrollTop = area.scrollTop;
      pre.scrollLeft = area.scrollLeft;
    }
  }, []);

  // Tapping in near the bottom of a long post focuses the textarea right
  // where the iOS keyboard is about to cover it — Safari doesn't reliably
  // scroll a non-native-scrolling container into view on its own the way it
  // does a plain single-line input. Nudge it up once the keyboard's layout
  // pass has happened (a raf beats the keyboard animation start).
  const scrollCaretIntoView = React.useCallback((event: React.FocusEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[hsl(var(--background))]",
        wrapperClassName,
      )}
    >
      <pre
        ref={preRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 m-0 overflow-hidden text-[hsl(var(--foreground))]",
          METRICS,
        )}
        // Trailing <br/> mirrors the textarea's phantom final line so the last
        // real line never clips when the caret sits at the end of the text.
        dangerouslySetInnerHTML={{ __html: `${html}<br/>` }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onScroll={syncScroll}
        onFocus={scrollCaretIntoView}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn(
          "relative block w-full resize-y bg-transparent text-transparent outline-none",
          "caret-[hsl(var(--primary))] selection:bg-[hsl(var(--primary)/0.25)] selection:text-transparent",
          "placeholder:text-[hsl(var(--muted-foreground))]",
          // iOS momentum scroll: without this, flinging through a long post
          // can drop scroll events mid-fling and the highlighted overlay
          // (which mirrors scrollTop on every "scroll" event) drifts out of
          // alignment with the real text underneath until the next tap.
          "[-webkit-overflow-scrolling:touch]",
          METRICS,
          className,
        )}
        {...rest}
      />
    </div>
  );
}
