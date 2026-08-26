import React, { type PropsWithChildren, useContext, useInsertionEffect } from 'react';
import instances from '../instances.js';
import { DISABLE_MOUSE_TRACKING, ENABLE_MOUSE_TRACKING, ENTER_ALT_SCREEN, EXIT_ALT_SCREEN } from '../termio/dec.js';
import { TerminalWriteContext } from '../useTerminalNotification.js';
import StdinContext from './StdinContext.js';
import Box from './Box.js';
import { TerminalSizeContext } from './TerminalSizeContext.js';
import { useTermHeight } from '../hooks/useTermWidth.js';

type Props = PropsWithChildren<{
  /** Enable SGR mouse tracking (wheel + click/drag). Default true. */
  mouseTracking?: boolean;
}>;

/**
 * Run children in the terminal's alternate screen buffer, constrained to
 * the viewport height. While mounted:
 *
 * - Enters the alt screen (DEC 1049), clears it, homes the cursor
 * - Constrains its own height to the terminal row count, so overflow must
 *   be handled via `overflow: scroll` / flexbox (no native scrollback)
 * - Optionally enables SGR mouse tracking (wheel + click/drag) — events
 *   surface as `ParsedKey` (wheel) and update the Ink instance's
 *   selection state (click/drag)
 *
 * On unmount, disables mouse tracking and exits the alt screen, restoring
 * the main screen's content. Safe for use in ctrl-o transcript overlays
 * and similar temporary fullscreen views — the main screen is preserved.
 *
 * Notifies the Ink instance via `setAltScreenActive()` so the renderer
 * keeps the cursor inside the viewport (preventing the cursor-restore LF
 * from scrolling content) and so signal-exit cleanup can exit the alt
 * screen if the component's own unmount doesn't run.
 */
export function AlternateScreen({
  children,
  mouseTracking = true,
}: Props): React.ReactNode {
  const size      = useContext(TerminalSizeContext);
  const liveRows  = useTermHeight();           // updates on every resize via SIGWINCH
  const rows      = liveRows || size?.rows || 24;
  const writeRaw  = useContext(TerminalWriteContext);
  const { stdout } = useContext(StdinContext);

  // useInsertionEffect (not useLayoutEffect): react-reconciler calls
  // resetAfterCommit between the mutation and layout commit phases, and
  // Ink's resetAfterCommit triggers onRender. With useLayoutEffect, that
  // first onRender fires BEFORE this effect — writing a full frame to the
  // main screen with altScreen=false. That frame is preserved when we
  // enter alt screen and revealed on exit as a broken view. Insertion
  // effects fire during the mutation phase, before resetAfterCommit, so
  // ENTER_ALT_SCREEN reaches the terminal before the first frame does.
  // Cleanup timing is unchanged: both insertion and layout effect cleanup
  // run in the mutation phase on unmount, before resetAfterCommit.
  useInsertionEffect(() => {
    const ink = instances.get(stdout);
    if (!writeRaw) return;

    writeRaw(
      ENTER_ALT_SCREEN +
        '\x1b[2J\x1b[H' +
        (mouseTracking ? ENABLE_MOUSE_TRACKING : ''),
    );
    ink?.setAltScreenActive(true, mouseTracking);

    return () => {
      ink?.setAltScreenActive(false);
      ink?.clearTextSelection();
      writeRaw((mouseTracking ? DISABLE_MOUSE_TRACKING : '') + EXIT_ALT_SCREEN);
    };
  }, [writeRaw, mouseTracking]);

  // Constrain to terminal viewport height. Yoga now receives the terminal
  // height at the root (via calculateLayout), so setting height={rows}
  // here gives the flex-shrink algorithm a real budget to work with.
  // overflow="hidden" clips any content that still exceeds the viewport
  // after flex-shrink runs.
  return (
    <Box
      flexDirection="column"
      width="100%"
      height={rows}
      overflow="hidden"
    >
      {children}
    </Box>
  );
}
