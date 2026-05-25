// src/ink/components/design-system/Dialog.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Clean, self-contained confirmation dialog for the Ink TUI.
//
// Replaces the old engine-dependent version which imported
// useExitOnCtrlCDWithKeybindings / useKeybinding / ConfigurableShortcutHint —
// none of which exist in this project.
//
// Keyboard:
//   [y / Y / Enter]   → onConfirm()
//   [n / N / Esc]     → onCancel()
//
// Usage:
//   {confirmDelete && (
//     <Dialog
//       title="Delete zone"
//       message={`Permanently delete "${zone.label}"? This cannot be undone.`}
//       onConfirm={handleConfirm}
//       onCancel={() => setConfirmDelete(null)}
//     />
//   )}
// ─────────────────────────────────────────────────────────────────────────────

import React          from "react";
import { Box, Text, useInput } from "../../runtimeInk.js";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DialogProps {
  /** Bold heading at the top of the dialog (e.g. "Delete zone") */
  title:     string;
  /** Body line — describe what will happen */
  message:   string;
  /** Called when the user confirms with y / Y / Enter */
  onConfirm: () => void;
  /** Called when the user cancels with n / N / Esc */
  onCancel:  () => void;
  /**
   * Pass `false` to suppress key handling while another overlay is active.
   * Default: true.
   */
  isActive?: boolean;
  /**
   * Accent color for the border and title.
   * Use "red" for destructive actions, "yellow" for warnings.
   * Default: "red".
   */
  color?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Dialog({
  title,
  message,
  onConfirm,
  onCancel,
  isActive = true,
  color    = "red",
}: DialogProps) {

  useInput((input, key) => {
    if (input === "y" || input === "Y" || key.return) { onConfirm(); return; }
    if (input === "n" || input === "N" || key.escape) { onCancel();  return; }
  }, { isActive });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={1}
      marginTop={1}
    >
      {/* ── Title ─────────────────────────────────────────────────────── */}
      <Text bold color={color}>{title}</Text>

      <Text> </Text>

      {/* ── Message ───────────────────────────────────────────────────── */}
      <Text>{message}</Text>

      <Text> </Text>

      {/* ── Key hints ─────────────────────────────────────────────────── */}
      <Box gap={4}>
        <Text color="green"><Text bold>[y]</Text>  confirm</Text>
        <Text dimColor>[n / Esc]  cancel</Text>
      </Box>
    </Box>
  );
}
