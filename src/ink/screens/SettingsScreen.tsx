// src/ink/screens/SettingsScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure config view.
//
// Reads %APPDATA%\unenter\config.json at mount.
// Press [e] to open the whole file in your default editor.
// Press [t] to edit the GHCR token inline (writes config.json on save).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from "react";
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
import { SearchInput }                                 from "../components/SearchBox.tsx";
import { useWidths }                                   from "../hooks/useTermWidth.ts";
import { Tabs }                                        from "../components/Tabs.tsx";
import { SectionFrame }                                from "../components/design-system/SectionFrame.tsx";
import { MetricCard }                                  from "../components/design-system/MetricCard.tsx";
import { ProgressLine }                                from "../components/design-system/ProgressLine.tsx";
import { sparkline }                                   from "../utils/sparkline.ts";

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
  if (days < 0)  return "error";
  if (days < 7)  return "error";
  if (days < 14) return "warning";
  return "success";
}

function timerLabel(days: number | null): string {
  if (days === null) return "not configured";
  if (days < 0)  return `expired ${Math.abs(days)}d ago`;
  if (days === 0) return "expires today";
  return `${days} days left`;
}

// ── Row helper ─────────────────────────────────────────────────────────────

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Box gap={1}>
      <Text dimColor>{label.padEnd(16)}</Text>
      <Text color={accent ?? "white"}>{value}</Text>
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

  const [activeTab, setTab]      = useState<"infra" | "identity" | "zones">("infra");
  const [tokenCfg,  setTokenCfg] = useState<TokenConfig>(() => readTokenConfig());
  const [editMode,  setEditMode] = useState(false);
  const [saved,     setSaved]    = useState(false);

  // Re-read from disk whenever we exit edit mode
  useEffect(() => {
    if (!editMode) setTokenCfg(readTokenConfig());
  }, [editMode]);

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleSave(val: string) {
    const trimmed = val.trim();
    if (trimmed) {
      writeToken(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1_500);
    }
    setEditMode(false);
    onTokenEditEnd();
  }

  function handleCancel() {
    setEditMode(false);
    onTokenEditEnd();
  }

  useInput((input, key) => {
    if (editMode) return;

    if (key.tab) {
      setTab((prev) => 
        prev === "infra" ? "identity" : 
        prev === "identity" ? "zones" : "infra"
      );
      return;
    }

    if (input === "1") { setTab("infra");    return; }
    if (input === "2") { setTab("identity"); return; }
    if (input === "3") { setTab("zones");    return; }

    if (activeTab === "identity" && input === "t") {
      setEditMode(true);
      onTokenEditStart();
    }
  });

  // ── Metrics ─────────────────────────────────────────────────────────────
  const days     = daysLeft(tokenCfg.ghcrTokenSetAt);
  const tColor   = timerColor(days);
  const tLabel   = timerLabel(days);
  const tRatio   = days !== null ? Math.max(0, Math.min(1, days / 30)) : 0;
  
  // Dummy history for sparkline — could be populated from real rotation logs
  const tokenHistory = useMemo(() => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].slice(-20), []);

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

      <Tabs
        tabs={["infrastructure", "identity", "zones"]}
        active={
          activeTab === "infra" ? "infrastructure" :
          activeTab === "identity" ? "identity" : "zones"
        }
        marginBottom={1}
      />

      <Divider width={dw} />

      {/* ── Infrastructure Tab ────────────────────────────────────────────── */}
      {activeTab === "infra" && (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Box gap={1}>
            <MetricCard 
              label="NPM Port" 
              value={String(NPM_HOST.port)} 
              note={NPM_HOST.ip} 
              tone="success" 
            />
            <MetricCard 
              label="Stack Port" 
              value={String(STACK_HOST.proxyPort)} 
              note={STACK_HOST.ip} 
              tone="accent" 
            />
          </Box>

          <SectionFrame title="Nginx Proxy Manager" tone="suggestion">
            <Row label="UI URL" value={NPM_HOST.uiUrl} accent="cyan" />
            <Row label="API URL" value={NPM_HOST.apiUrl} accent="cyan" />
            <Row label="Admin Email" value={NPM_HOST.email} />
            <Row label="Let's Encrypt" value={NPM_HOST.letsencryptEmail} />
          </SectionFrame>

          <SectionFrame title="Network & DNS" tone="suggestion">
            <Row label="Root Domain" value={DOMAIN} accent="cyan" />
            <Row label="DDNS Host" value={DDNS_PROVIDER.hostname} />
            <Row label="Project Root" value={PROJECT_DIR} />
          </SectionFrame>
        </Box>
      )}

      {/* ── Identity Tab ─────────────────────────────────────────────────── */}
      {activeTab === "identity" && (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Box gap={1}>
            <MetricCard 
              label="GHCR Token" 
              value={tokenCfg.ghcrToken ? "Active" : "Missing"} 
              note={tLabel} 
              tone={tColor as any} 
              trend={sparkline(tokenHistory)}
            />
            <MetricCard 
              label="GitHub User" 
              value={GHCR_USER} 
              note="repository owner" 
              tone="accent" 
            />
          </Box>

          <SectionFrame title="Token Management" tone="suggestion">
            {editMode ? (
              <Box gap={1} paddingY={1}>
                <Text color="yellow">Paste PAT: </Text>
                <SearchInput
                  active
                  width={42}
                  placeholder="ghp_..."
                  onSubmit={handleSave}
                  onCancel={handleCancel}
                />
              </Box>
            ) : (
              <Box flexDirection="column" gap={1}>
                <Box gap={2}>
                  <Text dimColor>{"Current PAT".padEnd(16)}</Text>
                  <Text>{tokenCfg.ghcrToken ? maskToken(tokenCfg.ghcrToken) : "Not Configured"}</Text>
                  {saved && <Text color="green">✓ saved</Text>}
                </Box>
                <ProgressLine 
                  label="Token Validity" 
                  ratio={tRatio} 
                  meta={tLabel} 
                  tone={tColor as any} 
                  width={dw - 24} 
                />
              </Box>
            )}
          </SectionFrame>
        </Box>
      )}

      {/* ── Zones Tab ────────────────────────────────────────────────────── */}
      {activeTab === "zones" && (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <SectionFrame title={`Managed Zones (${zones.length})`} tone="suggestion">
            {zones.length === 0 ? (
              <Text dimColor>No zones scaffolded yet.</Text>
            ) : (
              zones.map((z) => (
                <Box key={z.key} gap={2}>
                  <Text bold color="cyan">{z.key.padEnd(12)}</Text>
                  <Text color="white">{z.domain.padEnd(24)}</Text>
                  <Text dimColor>{z.container}</Text>
                </Box>
              ))
            )}
          </SectionFrame>
        </Box>
      )}

      <Box flexGrow={1} />
      <Divider width={dw} />

      {/* ── Key hints ───────────────────────────────────────────────────────── */}
      <KeyHints
        hints={
          editMode
            ? [{ k: "↵", label: "save token" }, { k: "esc/^C", label: "cancel" }]
            : [
                ...(activeTab === "identity" ? [{ k: "t", label: "edit token" }] : []),
                { k: "1-3",     label: "switch tabs"           },
                { k: "Tab",     label: "cycle tabs"            },
                { k: "e",       label: "open file in editor"   },
                { k: "esc / q", label: "back"                  },
              ]
        }
        marginTop={0}
        paddingX={0}
      />

    </Box>
  );
}
