import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "../runtimeInk.js";
import { STACK_IP_SAFE } from "../../config/stack.js";
import {
  generatePairingKey,
  REMOTE_IPC_PORT,
  KEY_TTL_H,
} from "../../utils/pairingKey.js";
import { setClipboard } from "../termio/osc.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const TEARDROP     = "✻";
const TITLE        = "UNAXIS";
const SETTLED_GREY = "#999999";
const KEY_COL      = "greenBright";

// ── Props ──────────────────────────────────────────────────────────────────────

interface KnownProject {
  slug:    string;
  path:    string;
  addedAt: string;
}

interface Props {
  knownProjects: KnownProject[];
  projectDir:    string;
  onClose:       () => void;
}

interface KeyOverlayState {
  key:       string;
  expiresAt: Date;
  host:      string;
  slug:      string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PairingKeyOverlay({ knownProjects, projectDir, onClose }: Props) {
  const [keyOverlay, setKeyOverlay] = useState<KeyOverlayState | null>(null);
  const [keyCopied, setKeyCopied]   = useState(false);

  // ── Keyboard handling ──────────────────────────────────────────────────────
  useInput((input, key) => {
    if (input === "q" || key.escape || input === "K") {
      onClose();
    }
  });

  // ── Key Generation & Clipboard copy on mount ───────────────────────────────
  useEffect(() => {
    const host = STACK_IP_SAFE || "127.0.0.1";
    const cur  = knownProjects.find((p) => p.path === projectDir);
    const slug = cur?.slug ?? "unaxis";

    const { key, token, expiresAt } = generatePairingKey(host, slug);
    setKeyOverlay({ key, expiresAt, host, slug });
    setKeyCopied(false);

    // Save tokens in secure credentials storage
    import("../../utils/secureStorage/index.js").then(({ setCredential }) => {
      const expSec = String(Math.floor(expiresAt.getTime() / 1000));
      setCredential("remote_bridge_token",     token).catch(() => {});
      setCredential("remote_bridge_token_exp", expSec).catch(() => {});
    }).catch(() => {});

    // Try setting clipboard via OSC 52
    setClipboard(key).then((seq) => {
      if (seq) process.stdout.write(seq);
      setKeyCopied(true);
    }).catch(() => { /* clipboard not available — user copies manually */ });
  }, [knownProjects, projectDir]);

  if (!keyOverlay) return null;

  // Trim expiry to just time + short date
  const expStr = keyOverlay.expiresAt.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  }) + "  " + keyOverlay.expiresAt.toLocaleDateString();

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>

      {/* ── Wordmark ── */}
      <Box marginBottom={1}>
        <Text color={SETTLED_GREY}>{TEARDROP}</Text>
      </Box>
      <Box marginBottom={2}>
        <Text bold color="white">{TITLE}</Text>
      </Box>

      {/* ── Title ── */}
      <Box gap={2} marginBottom={1}>
        <Text bold color={KEY_COL}>⬡  connection key</Text>
        <Text dimColor>{keyOverlay.slug}  ·  {KEY_TTL_H}h</Text>
      </Box>

      {/* ── Key — one unbroken line ── */}
      <Box marginBottom={1}>
        <Text color={KEY_COL}>{keyOverlay.key}</Text>
      </Box>

      {/* ── Copy status ── */}
      <Box marginBottom={2}>
        {keyCopied
          ? <Text color="green">✓ copied to clipboard</Text>
          : <Text dimColor>copy the key above manually</Text>
        }
      </Box>

      {/* ── Remote command ── */}
      <Box marginBottom={2}>
        <Text dimColor>on the remote machine:  </Text>
        <Text color="white">unaxis connect </Text>
        <Text dimColor>[paste]</Text>
      </Box>

      {/* ── Meta ── */}
      <Box gap={4} marginBottom={1}>
        <Text dimColor>host  <Text color="white">{keyOverlay.host}:{REMOTE_IPC_PORT}</Text></Text>
        <Text dimColor>exp  <Text color="white">{expStr}</Text></Text>
      </Box>

      {/* ── Close hint ── */}
      <Text dimColor>K / q / esc  close</Text>

    </Box>
  );
}
