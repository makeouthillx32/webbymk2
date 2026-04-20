// src/ink/screens/SettingsScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure config view.
//
// Reads %APPDATA%\unenter\config.json at mount.
// Press [e] to open the whole file in your default editor.
// Press [t] to edit the GHCR token inline (writes config.json on save).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { Box, Text, useInput }        from "ink";
import { join, dirname }              from "path";
import { homedir }                    from "os";
import { exec }                       from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

import { NPM_HOST, STACK_HOST, DDNS_PROVIDER, DOMAIN } from "../../config/stack.ts";
import type { Zone }                                   from "../../config/zones.ts";
import { GHCR_USER, PROJECT_DIR }                      from "../../config/zones.ts";
import { Divider }                                     from "../components/Divider.tsx";
import { KeyHints }                                    from "../components/KeyHint.tsx";
import { useWidths }                                   from "../hooks/useTermWidth.ts";

// ── Config file path ──────────────────────────────────────────────────────────

const CONFIG_PATH = join(
  process.env["APPDATA"] ?? join(homedir(), ".config"),
  "unenter",
  "config.json",
);

// ── Open file in system default editor ───────────────────────────────────────

export function openConfigInEditor(): void {
  const cmd =
    process.platform === "win32" ? `start "" "${CONFIG_PATH}"` :
    process.platform === "darwin" ? `open "${CONFIG_PATH}"` :
    `xdg-open "${CONFIG_PATH}"`;
  exec(cmd);
}

// ── Token config helpers ──────────────────────────────────────────────────────

interface TokenConfig {
  ghcrToken?:    string;
  ghcrTokenSetAt?: string;
}

function readTokenConfig(): TokenConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as TokenConfig;
  } catch {
    return {};
  }
}

function writeToken(pat: string): void {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
  } catch {}
  existing["ghcrToken"]    = pat;
  existing["ghcrTokenSetAt"] = new Date().toISOString();
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(existing, null, 2), "utf8");
}

function maskToken(tok: string): string {
  if (tok.length <= 8) return "••••••••";
  // Show first 8 chars (e.g. "ghp_xxxx") then mask the rest
  return tok.slice(0, 8) + "•".repeat(Math.min(tok.length - 8, 16));
}

/** Days remaining on a 30-day timer.  Negative = expired.  null = never set. */
function daysLeft(setAt: string | undefined): number | null {
  if (!setAt) return null;
  const ms = new Date(setAt).getTime();
  if (isNaN(ms)) return null;
  return 30 - Math.floor((Date.now() - ms) / 86_400_000);
}

function timerColor(days: number | null): string {
  if (days === null) return "gray";
  if (days < 0)  return "red";
  if (days < 7)  return "red";
  if (days < 14) return "yellow";
  return "green";
}

function timerLabel(days: number | null): string {
  if (days === null) return "not set — press [t] to add";
  if (days < 0)  return `expired ${Math.abs(days)}d ago — press [t] to renew`;
  if (days === 0) return "expires today — press [t] to renew";
  return `${days} / 30 days remaining`;
}

// ── Row / Section helpers ─────────────────────────────────────────────────────

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Box gap={1}>
      <Text dimColor>{label.padEnd(20)}</Text>
      <Text color={accent ?? "white"}>{value}</Text>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">{title}</Text>
      <Box flexDirection="column" paddingLeft={2}>
        {children}
      </Box>
    </Box>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SettingsScreenProps {
  zones:            Zone[];
  /** Called when inline token editor opens — suppresses App.tsx global keys */
  onTokenEditStart: () => void;
  /** Called when inline token editor closes */
  onTokenEditEnd:   () => void;
}

export function SettingsScreen({ zones, onTokenEditStart, onTokenEditEnd }: SettingsScreenProps) {
  const { tw, dw } = useWidths();

  // ── Token state ─────────────────────────────────────────────────────────
  const [tokenCfg,  setTokenCfg]  = useState<TokenConfig>(() => readTokenConfig());
  const [editMode,  setEditMode]  = useState(false);
  const [draft,     setDraft]     = useState("");
  const [saved,     setSaved]     = useState(false); // flash "saved!" for 1.5 s

  // Re-read from disk whenever we exit edit mode
  useEffect(() => {
    if (!editMode) setTokenCfg(readTokenConfig());
  }, [editMode]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (!editMode) {
      // [t] → enter token edit mode
      if (input === "t") {
        setDraft("");
        setEditMode(true);
        onTokenEditStart();
      }
      // Other keys ([esc/q/e]) are handled by App.tsx's settings handler.
      return;
    }

    // ── Edit mode — App.tsx handler is suspended (isActive:false) ──────────

    if (key.escape) {
      setEditMode(false);
      onTokenEditEnd();
      return;
    }

    if (key.return) {
      const trimmed = draft.trim();
      if (trimmed) {
        writeToken(trimmed);
        setSaved(true);
        setTimeout(() => setSaved(false), 1_500);
      }
      setEditMode(false);
      onTokenEditEnd();
      return;
    }

    if (key.backspace || key.delete) {
      setDraft((d) => d.slice(0, -1));
      return;
    }

    // Printable characters only
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setDraft((d) => d + input);
    }
  });

  // ── Derived timer values ──────────────────────────────────────────────────
  const days   = daysLeft(tokenCfg.ghcrTokenSetAt);
  const tColor = timerColor(days);
  const tLabel = timerLabel(days);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      width={tw}
    >

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">⚙  Settings</Text>
        <Text dimColor>unt.ink · local config</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Config file: </Text>
        <Text color="gray">{CONFIG_PATH}</Text>
      </Box>

      <Divider width={dw} />

      {/* ── Project root ────────────────────────────────────────────────────── */}
      <Section title="Project">
        <Row label="Root directory" value={PROJECT_DIR} accent="cyan" />
      </Section>

      {/* ── NPM host ────────────────────────────────────────────────────────── */}
      <Section title="NPM  (L0VE — Nginx Proxy Manager)">
        <Row label="IP"            value={NPM_HOST.ip} />
        <Row label="Port"          value={String(NPM_HOST.port)} />
        <Row label="UI"            value={NPM_HOST.uiUrl} accent="cyan" />
        <Row label="API"           value={NPM_HOST.apiUrl} accent="cyan" />
        <Row label="Admin email"   value={NPM_HOST.email} />
        <Row label="Password"      value={"•".repeat(Math.min(NPM_HOST.password.length, 16))} accent="gray" />
        <Row label="Let's Encrypt" value={NPM_HOST.letsencryptEmail} />
      </Section>

      {/* ── Stack host ──────────────────────────────────────────────────────── */}
      <Section title="Stack  (P0W3R — docker-compose host)">
        <Row label="IP"         value={STACK_HOST.ip} />
        <Row label="Proxy port" value={String(STACK_HOST.proxyPort)} />
      </Section>

      {/* ── DNS / DDNS ──────────────────────────────────────────────────────── */}
      <Section title="DNS / DDNS">
        <Row label="Root domain"    value={DOMAIN} accent="cyan" />
        <Row label="ASUS DDNS host" value={DDNS_PROVIDER.hostname} />
      </Section>

      {/* ── GHCR Token ──────────────────────────────────────────────────────── */}
      <Section title="GHCR Token  (GitHub Container Registry)">
        {editMode ? (
          // ── Inline token editor ─────────────────────────────────────────
          <Box flexDirection="column" gap={0}>
            <Box gap={1}>
              <Text dimColor>{"New token".padEnd(20)}</Text>
              <Text color="cyan">[ </Text>
              <Text color="white">{draft}</Text>
              <Text color="cyan" bold>▌</Text>
              <Text color="cyan"> ]</Text>
            </Box>
            <Box paddingLeft={21} gap={2} marginTop={0}>
              <Text dimColor>[↵] save</Text>
              <Text dimColor>[esc] cancel</Text>
            </Box>
          </Box>
        ) : (
          // ── Token display ───────────────────────────────────────────────
          <>
            <Box gap={1}>
              <Text dimColor>{"Token".padEnd(20)}</Text>
              {tokenCfg.ghcrToken
                ? <Text color="white">{maskToken(tokenCfg.ghcrToken)}</Text>
                : <Text dimColor color="red">not configured</Text>
              }
              {saved && <Text color="green">  ✓ saved</Text>}
            </Box>
            <Box gap={1}>
              <Text dimColor>{"30-day timer".padEnd(20)}</Text>
              <Text color={tColor}>{tLabel}</Text>
            </Box>
          </>
        )}
      </Section>

      {/* ── Zones ───────────────────────────────────────────────────────────── */}
      <Section title="Zones">
        {zones.map((z) => (
          <Box key={z.key} gap={1}>
            <Text dimColor>{z.key.padEnd(8)}</Text>
            <Text color="white">{z.domain.padEnd(28)}</Text>
            <Text dimColor>{z.container}</Text>
          </Box>
        ))}
        <Box marginTop={0} gap={1}>
          <Text dimColor>{"GHCR user".padEnd(8)}</Text>
          <Text color="gray">{GHCR_USER}</Text>
        </Box>
      </Section>

      <Divider width={dw} />

      {/* ── Key hints ───────────────────────────────────────────────────────── */}
      <KeyHints
        hints={
          editMode
            ? [{ k: "↵", label: "save token" }, { k: "esc", label: "cancel" }]
            : [
                { k: "t",       label: "edit GHCR token"       },
                { k: "e",       label: "open config in editor"  },
                { k: "esc / q", label: "back"                   },
              ]
        }
        marginTop={0}
        paddingX={0}
      />

    </Box>
  );
}
