import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "../runtimeInk.js";
import { STACK_IP_SAFE } from "../../config/stack.js";
import {
  generatePairingKey,
  parsePairingKey,
  REMOTE_IPC_PORT,
  KEY_TTL_H,
} from "../../utils/pairingKey.js";
import { setClipboard } from "../termio/osc.js";
import { spawn }                              from "child_process";
import { gracefulShutdownSync }               from "../../utils/gracefulShutdown.js";

// Dev mode = bun --watch (process.execPath contains "bun").
// Production = node running dist/cli.js.  R-restart is only meaningful in prod.
const isProductionMode = !process.execPath.toLowerCase().includes("bun");

function selfRestart(): void {
  const child = spawn(process.execPath, process.argv.slice(1), {
    stdio:    "inherit",
    detached: true,
    cwd:      process.cwd(),
    env:      { ...process.env, UNAXIS_RESTARTED: "1" },
  });
  child.unref();
  gracefulShutdownSync(0);
}

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
    } else if (input === "n" || input === "N") {
      issueKey(true);
    } else if ((input === "r" || input === "R") && isProductionMode) {
      selfRestart();
    }
  });

  // ── Key issuance: reuse active key or generate fresh ───────────────────────
  const issueKey = (forceNew = false) => {
    const host = STACK_IP_SAFE || "127.0.0.1";
    const cur  = knownProjects.find((p) => p.path === projectDir);
    const slug = cur?.slug ?? "unaxis";

    import("../../utils/secureStorage/index.js").then(async ({ getCredential, setCredential }) => {
      let resolved: { key: string; token: string; expiresAt: Date } | null = null;

      if (!forceNew) {
        // Try to reuse the stored key if it hasn't expired
        const [storedKey, storedExp] = await Promise.all([
          getCredential("remote_bridge_key"),
          getCredential("remote_bridge_token_exp"),
        ]).catch(() => [null, null]);

        if (storedKey && storedExp) {
          const expSec = Number(storedExp);
          const nowSec = Math.floor(Date.now() / 1000);
          if (expSec > nowSec) {
            // Valid — parse and reuse
            const payload = parsePairingKey(storedKey);
            if (payload) {
              resolved = {
                key:       storedKey,
                token:     payload.token,
                expiresAt: new Date(payload.exp * 1000),
              };
            }
          }
        }
      }

      if (!resolved) {
        // Generate a fresh key
        const generated = generatePairingKey(host, slug);
        resolved = generated;
        const expSec = String(Math.floor(generated.expiresAt.getTime() / 1000));
        await Promise.all([
          setCredential("remote_bridge_token",     generated.token),
          setCredential("remote_bridge_token_exp", expSec),
          setCredential("remote_bridge_key",       generated.key),
        ]).catch(() => {});
      }

      setKeyOverlay({ key: resolved.key, expiresAt: resolved.expiresAt, host, slug });
      setKeyCopied(false);

      // Try setting clipboard via OSC 52
      setClipboard(resolved.key).then((seq) => {
        if (seq) process.stdout.write(seq);
        setKeyCopied(true);
      }).catch(() => { /* clipboard not available — user copies manually */ });
    }).catch(() => {});
  };

  useEffect(() => { issueKey(false); }, [knownProjects, projectDir]);

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
        <Text dimColor>{keyOverlay.slug}  ·  {KEY_TTL_H >= 48 ? `${KEY_TTL_H / 24}d` : `${KEY_TTL_H}h`}</Text>
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
      <Text dimColor>
        {"N  new key"}
        {isProductionMode ? "    ·    R  restart" : ""}
        {"    ·    K / q / esc  close"}
      </Text>

    </Box>
  );
}
