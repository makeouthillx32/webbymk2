// src/ink/screens/SettingsScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure config view.
//
// Tabs:
//   infrastructure — ports, URLs, network config, default project path
//   identity       — credentials: ghcr_token + npm_token (masked, age-tracked)
//   zones          — scaffolded zones list
//
// Credentials are stored in ~/.unaxis/.credentials.json via secureStorage.
// Settings (non-secret) are in ~/.unaxis/settings.json.
//
// Hotkeys:
//   [t]  edit GHCR token (identity tab)
//   [n]  edit npm token  (identity tab)
//   [p]  edit default project path (infrastructure tab)
//   [e]  open ~/.unaxis/settings.json in system editor
//   [1-3] / Tab — switch tabs
//   esc / q — back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput }        from "ink";
import { spawn }                      from "child_process";
import { existsSync }                 from "fs";
import { join, resolve }              from "path";

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

import {
  getCredential, setCredential,
  getSetting,    setSetting,
  getSettingsPath, getCredentialsPath,
} from "../../utils/secureStorage/index.js";

// ── Open file in system default editor ───────────────────────────────────────

export function openConfigInEditor(): void {
  const path = getSettingsPath();
  const command =
    process.platform === "win32" ? "cmd.exe" :
    process.platform === "darwin" ? "open" :
    "xdg-open";
  const args =
    process.platform === "win32" ? ["/c", "start", "", path] :
    [path];

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    // Best-effort convenience; the settings path is still visible on screen.
  }
}

// ── Token helpers ─────────────────────────────────────────────────────────────

function maskToken(tok: string): string {
  if (tok.length <= 8) return "••••••••";
  return tok.slice(0, 8) + "•".repeat(Math.min(tok.length - 8, 16));
}

/** Days remaining on a 30-day timer. Negative = expired. null = never set. */
function daysLeft(setAtIso: string | null): number | null {
  if (!setAtIso) return null;
  const ms = new Date(setAtIso).getTime();
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

function isProjectRootPath(path: string): boolean {
  return (
    existsSync(path) &&
    existsSync(join(path, "docker-compose.yml")) &&
    existsSync(join(path, "src", "ink"))
  );
}

// ── Row helper ────────────────────────────────────────────────────────────────

function Row({ label, value, accent, dim }: { label: string; value: string; accent?: string; dim?: boolean }) {
  return (
    <Box gap={1}>
      <Text dimColor>{label.padEnd(18)}</Text>
      <Text color={accent ?? "white"} dimColor={dim}>{value}</Text>
    </Box>
  );
}

// ── Token state ───────────────────────────────────────────────────────────────

interface TokenState {
  value:   string | null;
  setAt:   string | null;  // ISO timestamp stored alongside token
  loading: boolean;
}

const BLANK_TOKEN: TokenState = { value: null, setAt: null, loading: true };

// ── Edit mode enum ─────────────────────────────────────────────────────────────

type EditField = "ghcr_token" | "npm_token" | "default_project" | null;

// ── Component ─────────────────────────────────────────────────────────────────

interface SettingsScreenProps {
  zones:            Zone[];
  onTokenEditStart: () => void;
  onTokenEditEnd:   () => void;
}

export function SettingsScreen({ zones, onTokenEditStart, onTokenEditEnd }: SettingsScreenProps) {
  const { tw, dw } = useWidths();

  const [activeTab,  setTab]       = useState<"infra" | "identity" | "zones">("infra");
  const [editField,  setEditField] = useState<EditField>(null);
  const [saved,      setSaved]     = useState<string | null>(null);

  // ── Credential state ────────────────────────────────────────────────────────
  const [ghcr,    setGhcr]    = useState<TokenState>(BLANK_TOKEN);
  const [npm,     setNpm]     = useState<TokenState>(BLANK_TOKEN);

  // ── Settings state ──────────────────────────────────────────────────────────
  const [defaultProject, setDefaultProject] = useState<string | null>(null);

  // ── Load credentials + settings async on mount / after edit ────────────────
  const reload = useCallback(async () => {
    const [ghcrVal, ghcrSetAt, npmVal, npmSetAt, proj] = await Promise.all([
      getCredential("ghcr_token"),
      getCredential("ghcr_token_set_at"),
      getCredential("npm_token"),
      getCredential("npm_token_set_at"),
      getSetting("default_project"),
    ]);
    setGhcr({ value: ghcrVal, setAt: ghcrSetAt, loading: false });
    setNpm({ value: npmVal, setAt: npmSetAt, loading: false });
    setDefaultProject(proj);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // ── Save handlers ──────────────────────────────────────────────────────────
  async function handleSave(val: string) {
    const trimmed = val.trim();
    if (trimmed && editField) {
      if (editField === "ghcr_token") {
        await setCredential("ghcr_token", trimmed);
        await setCredential("ghcr_token_set_at", new Date().toISOString());
        setSaved("ghcr");
      } else if (editField === "npm_token") {
        await setCredential("npm_token", trimmed);
        await setCredential("npm_token_set_at", new Date().toISOString());
        setSaved("npm");
      } else if (editField === "default_project") {
        const resolved = resolve(trimmed);
        if (!isProjectRootPath(resolved)) {
          setSaved("project-error");
          setTimeout(() => setSaved(null), 2_000);
          setEditField(null);
          onTokenEditEnd();
          return;
        }
        await setSetting("default_project", resolved);
        setSaved("project");
      }
      setTimeout(() => setSaved(null), 2_000);
      await reload();
    }
    setEditField(null);
    onTokenEditEnd();
  }

  function handleCancel() {
    setEditField(null);
    onTokenEditEnd();
  }

  function startEdit(field: EditField) {
    setEditField(field);
    onTokenEditStart();
  }

  // ── Keyboard handler ────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (editField) return;

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

    if (input === "e") { openConfigInEditor(); return; }

    if (activeTab === "identity") {
      if (input === "t") { startEdit("ghcr_token"); return; }
      if (input === "n") { startEdit("npm_token");  return; }
    }

    if (activeTab === "infra" && input === "p") {
      startEdit("default_project");
      return;
    }
  });

  // ── Metrics ─────────────────────────────────────────────────────────────────
  const ghcrDays   = daysLeft(ghcr.setAt);
  const ghcrColor  = timerColor(ghcrDays);
  const ghcrLabel  = timerLabel(ghcrDays);
  const ghcrRatio  = ghcrDays !== null ? Math.max(0, Math.min(1, ghcrDays / 30)) : 0;

  const npmDays    = daysLeft(npm.setAt);
  const npmColor   = timerColor(npmDays);
  const npmLabel   = timerLabel(npmDays);
  const npmRatio   = npmDays !== null ? Math.max(0, Math.min(1, npmDays / 30)) : 0;

  const tokenHistory = useMemo(() =>
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], []);

  // ── Edit placeholder text ───────────────────────────────────────────────────
  const editPlaceholder =
    editField === "ghcr_token"      ? "ghp_..." :
    editField === "npm_token"       ? "npm_..." :
    editField === "default_project" ? defaultProject ?? "/path/to/project" :
    "";

  const editLabel =
    editField === "ghcr_token"      ? "Paste GHCR PAT: " :
    editField === "npm_token"       ? "Paste npm token: " :
    editField === "default_project" ? "Project path: " :
    "";

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
        <Text dimColor>UNAXIS · local config</Text>
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
              tone="suggestion"
            />
          </Box>

          <SectionFrame title="Nginx Proxy Manager" tone="suggestion">
            <Row label="UI URL"        value={NPM_HOST.uiUrl}            accent="cyan" />
            <Row label="API URL"       value={NPM_HOST.apiUrl}            accent="cyan" />
            <Row label="Admin Email"   value={NPM_HOST.email}             />
            <Row label="Let's Encrypt" value={NPM_HOST.letsencryptEmail}  />
          </SectionFrame>

          <SectionFrame title="Network & DNS" tone="suggestion">
            <Row label="Root Domain" value={DOMAIN}                accent="cyan" />
            <Row label="DDNS Host"   value={DDNS_PROVIDER.hostname}              />
          </SectionFrame>

          <SectionFrame title="Project Root" tone="suggestion">
            {editField === "default_project" ? (
              <Box gap={1} paddingY={1}>
                <Text color="yellow">{editLabel}</Text>
                <SearchInput
                  active
                  width={42}
                  placeholder={editPlaceholder}
                  onSubmit={handleSave}
                  onCancel={handleCancel}
                />
              </Box>
            ) : (
              <Box gap={2}>
                <Row
                  label="default_project"
                  value={defaultProject ?? "(not set - using runtime root)"}
                  accent={defaultProject ? "cyan" : undefined}
                  dim={!defaultProject}
                />
                {saved === "project" && <Text color="green">✓ saved</Text>}
                {saved === "project-error" && <Text color="red">invalid project root</Text>}
              </Box>
            )}
            <Box marginTop={1} gap={1}>
              <Text dimColor>{"settings:    "}</Text>
              <Text dimColor color="gray">{getSettingsPath()}</Text>
            </Box>
          </SectionFrame>
        </Box>
      )}

      {/* ── Identity Tab ─────────────────────────────────────────────────── */}
      {activeTab === "identity" && (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Box gap={1}>
            <MetricCard
              label="GHCR Token"
              value={ghcr.loading ? "…" : ghcr.value ? "Active" : "Missing"}
              note={ghcrLabel}
              tone={ghcrColor as any}
              trend={sparkline(tokenHistory)}
            />
            <MetricCard
              label="npm Token"
              value={npm.loading ? "…" : npm.value ? "Active" : "Missing"}
              note={npmLabel}
              tone={npmColor as any}
              trend={sparkline(tokenHistory)}
            />
            <MetricCard
              label="GitHub User"
              value={GHCR_USER}
              note="registry owner"
              tone="suggestion"
            />
          </Box>

          {/* ── GHCR token ─────────────────────────────────────────────────── */}
          <SectionFrame title="GitHub Container Registry (GHCR)" tone="suggestion">
            {editField === "ghcr_token" ? (
              <Box gap={1} paddingY={1}>
                <Text color="yellow">{editLabel}</Text>
                <SearchInput
                  active
                  width={42}
                  placeholder={editPlaceholder}
                  onSubmit={handleSave}
                  onCancel={handleCancel}
                />
              </Box>
            ) : (
              <Box flexDirection="column" gap={1}>
                <Box gap={2}>
                  <Text dimColor>{"Current PAT".padEnd(18)}</Text>
                  <Text>{ghcr.value ? maskToken(ghcr.value) : "Not configured"}</Text>
                  {saved === "ghcr" && <Text color="green">✓ saved</Text>}
                </Box>
                <ProgressLine
                  label="Token validity"
                  ratio={ghcrRatio}
                  meta={ghcrLabel}
                  tone={ghcrColor as any}
                  width={dw - 24}
                />
              </Box>
            )}
          </SectionFrame>

          {/* ── npm token ──────────────────────────────────────────────────── */}
          <SectionFrame title="npm Publish Token" tone="suggestion">
            {editField === "npm_token" ? (
              <Box gap={1} paddingY={1}>
                <Text color="yellow">{editLabel}</Text>
                <SearchInput
                  active
                  width={42}
                  placeholder={editPlaceholder}
                  onSubmit={handleSave}
                  onCancel={handleCancel}
                />
              </Box>
            ) : (
              <Box flexDirection="column" gap={1}>
                <Box gap={2}>
                  <Text dimColor>{"Current Token".padEnd(18)}</Text>
                  <Text>{npm.value ? maskToken(npm.value) : "Not configured"}</Text>
                  {saved === "npm" && <Text color="green">✓ saved</Text>}
                </Box>
                <ProgressLine
                  label="Token validity"
                  ratio={npmRatio}
                  meta={npmLabel}
                  tone={npmColor as any}
                  width={dw - 24}
                />
                <Box marginTop={1}>
                  <Text dimColor>{"credentials: "}</Text>
                  <Text dimColor color="gray">{getCredentialsPath()}</Text>
                </Box>
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
          editField
            ? [{ k: "↵", label: "save" }, { k: "esc/^C", label: "cancel" }]
            : [
                ...(activeTab === "identity" ? [
                  { k: "t", label: "edit GHCR token" },
                  { k: "n", label: "edit npm token"  },
                ] : []),
                ...(activeTab === "infra" ? [
                  { k: "p", label: "set project path" },
                ] : []),
                { k: "1-3",     label: "switch tabs"         },
                { k: "Tab",     label: "cycle tabs"           },
                { k: "e",       label: "open settings in editor" },
                { k: "esc / q", label: "back"                 },
              ]
        }
        marginTop={0}
        paddingX={0}
      />
    </Box>
  );
}
