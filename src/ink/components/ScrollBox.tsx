import React, { type PropsWithChildren, type Ref, useImperativeHandle, useRef, useState, createContext, useContext, useEffect, type RefObject, useMemo } from 'react';
import type { Except } from 'type-fest';
import { markScrollActivity } from '../../bootstrap/state.js';
import type { DOMElement } from '../dom.js';
import { markDirty, scheduleRenderFrom } from '../dom.js';
import { markCommitStart } from '../reconciler.js';
import type { Styles } from '../styles.js';
import '../global.d.ts';
import Box from './Box.js';
export type ScrollBoxHandle = {
  scrollTo: (y: number) => void;
  scrollBy: (dy: number) => void;
  /**
   * Scroll so `el`'s top is at the viewport top (plus `offset`). Unlike
   * scrollTo which bakes a number that's stale by the time the throttled
   * render fires, this defers the position read to render time —
   * render-node-to-output reads `el.yogaNode.getComputedTop()` in the
   * SAME Yoga pass that computes scrollHeight. Deterministic. One-shot.
   */
  scrollToElement: (el: DOMElement, offset?: number) => void;
  scrollToBottom: () => void;
  getScrollTop: () => number;
  getPendingDelta: () => number;
  getScrollHeight: () => number;
  /**
   * Like getScrollHeight, but reads Yoga directly instead of the cached
   * value written by render-node-to-output (throttled, up to 16ms stale).
   * Use when you need a fresh value in useLayoutEffect after a React commit
   * that grew content. Slightly more expensive (native Yoga call).
   */
  getFreshScrollHeight: () => number;
  getViewportHeight: () => number;
  /**
   * Absolute screen-buffer row of the first visible content line (inside
   * padding). Used for drag-to-scroll edge detection.
   */
  getViewportTop: () => number;
  /**
   * True when scroll is pinned to the bottom. Set by scrollToBottom, the
   * initial stickyScroll attribute, and by the renderer when positional
   * follow fires (scrollTop at prevMax, content grows). Cleared by
   * scrollTo/scrollBy. Stable signal for "at bottom" that doesn't depend on
   * layout values (unlike scrollTop+viewportH >= scrollHeight).
   */
  isSticky: () => boolean;
  /**
   * Subscribe to imperative scroll changes (scrollTo/scrollBy/scrollToBottom).
   * Does NOT fire for stickyScroll updates done by the Ink renderer — those
   * happen during Ink's render phase after React has committed. Callers that
   * care about the sticky case should treat "at bottom" as a fallback.
   */
  subscribe: (listener: () => void) => () => void;
  /**
   * Set the render-time scrollTop clamp to the currently-mounted children's
   * coverage span. Called by useVirtualScroll after computing its range;
   * render-node-to-output clamps scrollTop to [min, max] so burst scrollTo
   * calls that race past React's async re-render show the edge of mounted
   * content instead of blank spacer. Pass undefined to disable (sticky,
   * cold start).
   */
  setClampBounds: (min: number | undefined, max: number | undefined) => void;
  getDOMNode: () => DOMElement | null;
};
export type ScrollBoxProps = Except<Styles, 'textWrap' | 'overflow' | 'overflowX' | 'overflowY'> & {
  /**
   * When true, automatically pins scroll position to the bottom when content
   * grows. Unset manually via scrollTo/scrollBy to break the stickiness.
   */
  stickyScroll?: boolean;
};

/**
 * A Box with `overflow: scroll` and an imperative scroll API.
 *
 * Children are laid out at their full Yoga-computed height inside a
 * constrained container. At render time, only children intersecting the
 * visible window (scrollTop..scrollTop+height) are rendered (viewport
 * culling). Content is translated by -scrollTop and clipped to the box bounds.
 *
 * Works best inside a fullscreen (constrained-height root) Ink tree.
 */
export const ScrollBoxContext = createContext<ScrollBoxHandle | null>(null);

export function useScrollIntoView(
  ref: RefObject<DOMElement | null>,
  isActive: boolean,
  offset = 0,
  scrollTrigger: any = isActive
) {
  const scrollBox = useContext(ScrollBoxContext);

  useEffect(() => {
    if (!isActive || !scrollBox || !ref.current) return;

    const el = ref.current;
    const timer = setTimeout(() => {
      const yoga = el.yogaNode;
      if (!yoga) return;

      const scrollBoxDOM = scrollBox.getDOMNode();
      if (!scrollBoxDOM) return;

      // Walk up the DOM parent chain to calculate the cumulative top of `el` relative to `scrollBoxDOM`
      let elementTop = yoga.getComputedTop();
      let parent = el.parentNode as DOMElement | undefined;
      while (parent && parent !== scrollBoxDOM) {
        if (parent.yogaNode) {
          elementTop += parent.yogaNode.getComputedTop();
        }
        parent = parent.parentNode as DOMElement | undefined;
      }

      const elementHeight = yoga.getComputedHeight();
      const scrollTop = scrollBox.getScrollTop();
      const viewportHeight = scrollBox.getViewportHeight();

      if (viewportHeight <= 0) return;

      if (elementTop < scrollTop) {
        scrollBox.scrollTo(elementTop - offset);
      } else if (elementTop + elementHeight > scrollTop + viewportHeight) {
        scrollBox.scrollTo(elementTop + elementHeight - viewportHeight + offset);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isActive, scrollBox, ref, offset, scrollTrigger]);
}


function ScrollBox({
  children,
  stickyScroll,
  ...style
}: PropsWithChildren<ScrollBoxProps>, ref: Ref<ScrollBoxHandle>): React.ReactNode {
  const domRef = useRef<DOMElement>(null);
  const [, forceRender] = useState(0);
  const listenersRef = useRef(new Set<() => void>());
  const renderQueuedRef = useRef(false);
  const notify = () => {
    for (const l of listenersRef.current) l();
  };
  function scrollMutated(el: DOMElement): void {
    markScrollActivity();
    markDirty(el);
    markCommitStart();
    notify();
    if (renderQueuedRef.current) return;
    renderQueuedRef.current = true;
    queueMicrotask(() => {
      renderQueuedRef.current = false;
      scheduleRenderFrom(el);
    });
  }

  const handle = useMemo((): ScrollBoxHandle => ({
    scrollTo(y: number) {
      const el = domRef.current;
      if (!el) return;
      el.stickyScroll = false;
      el.pendingScrollDelta = undefined;
      el.scrollAnchor = undefined;
      el.scrollTop = Math.max(0, Math.floor(y));
      scrollMutated(el);
    },
    scrollToElement(el: DOMElement, offset = 0) {
      const box = domRef.current;
      if (!box) return;
      box.stickyScroll = false;
      box.pendingScrollDelta = undefined;
      box.scrollAnchor = {
        el,
        offset
      };
      scrollMutated(box);
    },
    scrollBy(dy: number) {
      const el = domRef.current;
      if (!el) return;
      el.stickyScroll = false;
      el.scrollAnchor = undefined;
      el.pendingScrollDelta = (el.pendingScrollDelta ?? 0) + Math.floor(dy);
      scrollMutated(el);
    },
    scrollToBottom() {
      const el = domRef.current;
      if (!el) return;
      el.pendingScrollDelta = undefined;
      el.stickyScroll = true;
      markDirty(el);
      notify();
      forceRender(n => n + 1);
    },
    getScrollTop() {
      return domRef.current?.scrollTop ?? 0;
    },
    getPendingDelta() {
      return domRef.current?.pendingScrollDelta ?? 0;
    },
    getScrollHeight() {
      return domRef.current?.scrollHeight ?? 0;
    },
    getFreshScrollHeight() {
      const content = domRef.current?.childNodes[0] as DOMElement | undefined;
      return content?.yogaNode?.getComputedHeight() ?? domRef.current?.scrollHeight ?? 0;
    },
    getViewportHeight() {
      return domRef.current?.scrollViewportHeight ?? 0;
    },
    getViewportTop() {
      return domRef.current?.scrollViewportTop ?? 0;
    },
    isSticky() {
      const el = domRef.current;
      if (!el) return false;
      return el.stickyScroll ?? Boolean(el.attributes['stickyScroll']);
    },
    subscribe(listener: () => void) {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
    setClampBounds(min, max) {
      const el = domRef.current;
      if (!el) return;
      el.scrollClampMin = min;
      el.scrollClampMax = max;
    },
    getDOMNode() {
      return domRef.current;
    }
  }), []);

  useImperativeHandle(ref, () => handle, [handle]);

  return (
    <ScrollBoxContext.Provider value={handle}>
      <ink-box ref={el => {
        domRef.current = el;
        if (el) el.scrollTop ??= 0;
      }} style={{
        flexWrap: 'nowrap',
        flexDirection: style.flexDirection ?? 'row',
        flexGrow: style.flexGrow ?? 0,
        flexShrink: style.flexShrink ?? 1,
                ...style,
        overflowX: 'hidden',
        overflowY: 'scroll'
      }} {...stickyScroll ? {
        stickyScroll: true
      } : {}}>
        <Box flexDirection="column" flexGrow={1} flexShrink={0} width="100%">
          {children}
        </Box>
      </ink-box>
    </ScrollBoxContext.Provider>
  );
}
export default React.forwardRef<ScrollBoxHandle, PropsWithChildren<ScrollBoxProps>>(ScrollBox);
