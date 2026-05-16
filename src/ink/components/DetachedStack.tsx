// src/ink/components/DetachedStack.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Multi-op background stack — shows all background operations simultaneously.
//
// Layout (stacked-paper metaphor):
//
//   ────────────────────────────────────────────────────────────
//   ⣾  Build Shop · running           [↑↓] switch  [o] hide  [↵] full
//   ┌──────────────────────────────────────────────────────────┐
//   │ Pushing layer 9d4c6b…                                    │
//   │ Layer 3f6f06: Waiting                                    │
//   └──────────────────────────────────────────────────────────┘
//    └─ ✓  Deploy Blog · done  [x] dismiss
//     └─ ⣾  Reload proxy · running
//
// Keys (focused):
//   [↑↓/jk] switch   [↵] full overlay   [x] dismiss   [X] clear done
//   [c] copy full log   [v] copy visible tail   [O] pop out   [h] hide
//   [q]/[esc] unfocus / kill dismissable
//
// Keyboard ownership: DetachedStack owns all Stack-context keys while mounted.
// It only mounts when stackOpen && ops.length > 0, so its useInput is naturally
// scoped — no keys fire when the stack pane is hidden.
// ─────────────────────────────────────────────────────────────────────────────

import React                                   from "react";
import { Box, Text, useInput }                 from "ink";
import { Divider }                             from "./Divider.tsx";
import { Spinner }                             from "./Spinner.tsx";
import { LoadingState }                        from "./design-system/LoadingState.tsx";
import { useWidths }                           from "../hooks/useTermWidth.ts";
import { useRegisterKeybindingContext }        from "../KeybindingContext.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StackOp {
  id:          number;
  title:       string;
  lines:       string[];
  busy:        boolean;
  isLog:       boolean;
  /** When true, [x] dismiss is allowed even while busy (used by dev-mode ops). */
  dismissable?: boolean;
}

interface DetachedStackProps {
  ops:           StackOp[];
  focusedId:     number | null;
  /** True for 1.5 s after a successful [c]/[v] copy — triggers inline flash */
  didCopy?:      boolean;

  onUp?:         () => void;   // k / ↑
  onDown?:       () => void;   // j / ↓
  onEnter?:      () => void;   // ↵  — open focused op as full-screen overlay
  onDismiss?:    () => void;   // x  — dismiss focused done op
  onDismissAll?: () => void;   // X  — clear all done ops
  onPopout?:     () => void;   // O  — pop focused op to external terminal
  onCopy?:       () => void;   // c  — copy full log to clipboard
  onCopyTail?:   () => void;   // v  — copy only the visible tail lines
  onClose?:      () => void;   // q/esc — unfocus strip, return focus to panel
  onHide?:       () => void;   // h  — collapse strip without dismissing ops
  /** When false the stack pane is visible but yields keyboard control back to
   *  the main panel so multiple ops can be started without closing the strip. */
  isActive?:     boolean;
}

// ── Shadow strip — one collapsed op underneath the focused one ────────────────

function ShadowStrip({ op, depth }: { op: StackOp; depth: number }) {
  const canDismiss = op.dismissable ?? !op.busy;
  return (
    <Box paddingLeft={depth + 1} gap={1}>
      <Text dimColor>{"└─"}</Text>
      <Spinner active={op.busy} color={op.busy ? "yellow" : "green"} />
      <Text color={op.busy ? "yellow" : undefined} dimColor={!op.busy}>
        {op.title}
      </Text>
      {canDismiss && <Text dimColor>  [x] dismiss</Text>}
    </Box>
  );
}

// ── Main stack component ──────────────────────────────────────────────────────

const LOG_LINES    = 8;
/** Max shadow strip rows rendered below the focused op before collapsing to a summary line. */
const MAX_SHADOWS  = 7;

export function DetachedStack({
  ops, focusedId, didCopy,
  onUp, onDown, onEnter, onDismiss, onDismissAll, onPopout, onCopy, onCopyTail, onClose, onHide,
  isActive = true,
}: DetachedStackProps) {
  const { dw } = useWidths();

  useRegisterKeybindingContext('Stack');

  const focused = ops.find((o) => o.id === focusedId) ?? ops[ops.length - 1] ?? null;

  useInput((input, key) => {
    if (key.escape) {
      if (focused?.dismissable) { onDismiss?.(); } else { onClose?.(); }
      return;
    }
    if (input === "q") { onClose?.();     return; }
    if (input === "h") { onHide?.();      return; }
    if (key.upArrow   || input === "k") { onUp?.();         return; }
    if (key.downArrow || input === "j") { onDown?.();       return; }
    if (key.return)                     { onEnter?.();      return; }
    if (input === "x")                  { onDismiss?.();    return; }
    if (input === "X")                  { onDismissAll?.(); return; }
    if (input === "O")                  { onPopout?.();     return; }
    if (input === "c")                  { onCopy?.();       return; }
    if (input === "v")                  { onCopyTail?.();   return; }
  }, { isActive });

  if (ops.length === 0 || !focused) return null;

  const rest        = ops.filter((o) => o.id !== focused.id);
  const visibleRest = rest.slice(0, MAX_SHADOWS);
  const hiddenCount = rest.length - visibleRest.length;
  const visible     = focused.lines.slice(-LOG_LINES);

  const runCount          = ops.filter((o) =>  o.busy && !(o.dismissable)).length;
  const doneCount         = ops.filter((o) => !o.busy || o.dismissable).length;
  const canDismissFocused = focused.dismissable ?? !focused.busy;

  const statusTag = ops.length > 1
    ? [
        runCount  > 0 && `${runCount} running`,
        doneCount > 0 && `${doneCount} done`,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <Box flexDirection="column" marginTop={1}>

      {/* ── Divider — doubles as passive call-to-action when not focused ──── */}
      {isActive
        ? <Divider width={dw} />
        : <Divider
            width={dw}
            title={`${runCount > 0 ? `${runCount} running` : ""}${runCount > 0 && doneCount > 0 ? " · " : ""}${doneCount > 0 ? `${doneCount} done` : ""}  ·  [o] interact  [O] stack view`}
          />
      }

      {/* ── Focused op header ──────────────────────────────────────────────── */}
      <Box justifyContent="space-between" paddingX={1} marginBottom={0}>
        <Box gap={1}>
          <Spinner active={focused.busy} color={focused.busy ? "yellow" : "green"} />
          <Text bold color={focused.busy ? "yellow" : "green"}>
            {focused.title}
          </Text>
          {!focused.busy && <Text dimColor>— done</Text>}
          {statusTag !== "" && (
            <Text dimColor>  ·  {statusTag}</Text>
          )}
        </Box>
        {isActive && (
          <Box gap={2}>
            {rest.length > 0 && <Text dimColor>[↑↓] switch</Text>}
            {focused.dismissable && <Text color="red" dimColor>[esc] kill</Text>}
            <Text dimColor>[o] unfocus  [h] hide  [O] pop out  [↵] full</Text>
          </Box>
        )}
      </Box>

      {/* ── Log tail ──────────────────────────────────────────────────────── */}
      <Box
        borderStyle="single"
        borderColor={focused.busy ? "yellow" : "green"}
        flexDirection="column"
        paddingX={1}
        marginX={1}
      >
        {visible.length === 0
          ? <LoadingState label="Waiting for output…" />
          : visible.map((line, i) => (
              <Text key={i} wrap="truncate-end">{line}</Text>
            ))
        }
      </Box>

      {/* ── Bottom key hints ───────────────────────────────────────────────── */}
      {isActive && (
        <Box paddingX={2} gap={2} marginTop={0}>
          {canDismissFocused
            ? <Text dimColor>[x] dismiss</Text>
            : <Text dimColor color="gray">[x] dismiss</Text>
          }
          {doneCount > 0 && <Text dimColor>[X] clear done</Text>}
          <Text dimColor>{didCopy ? "✓ copied!" : "[c] copy all  [v] copy visible"}</Text>
        </Box>
      )}

      {/* ── Shadow strips — other ops peeking underneath ───────────────────── */}
      {visibleRest.map((op, i) => (
        <ShadowStrip key={op.id} op={op} depth={i} />
      ))}
      {hiddenCount > 0 && (
        <Box paddingLeft={visibleRest.length + 2}>
          <Text dimColor>+ {hiddenCount} more  [O] see all</Text>
        </Box>
      )}
    </Box>
  );
}
