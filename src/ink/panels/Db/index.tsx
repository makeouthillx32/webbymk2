// src/ink/panels/Db/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Database panel — three internal tabs:
//
//   [1] Core Supabase   — control-plane DB, metrics, actions, keys
//   [2] Runtime Instances — live deployed branches (NPM-proxied, public URLs)
//   [3] Snapshots       — all captured snapshots across core + instances
//
// Note: StartupScreen [I] overlay also shows instances but as local-only
// (no NPM, no domain routing). Project instances are the full deployment.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput } from "../../runtimeInk.js";
import { openBrowser } from "@/utils/browser.ts";
import {
  KONG_URL, STUDIO_PROJECT_URL, ANON_KEY, SERVICE_KEY,
  postgresConnStr, instanceStudioPageUrl, instanceStudioMcpPageUrl,
  buildConnectionSheet, buildMcpConfig, updateInstancePassword, updateInstanceDashboardPassword, verifyCoreStack,
  reregisterInstanceNpm,
} from "../../db-api.ts";
import { loadRegistry } from "../../zone/supabase-factory.ts";
import type { RuntimeInstance, HealthState } from "../../zone/supabase-factory.ts";
import { PROJECT_DIR, DOMAIN } from "../../../config/stack.ts";
import { listSnapshots, listOrphanSnapshots } from "../../zone/snapshot.ts";
import type { SnapshotBundle } from "../../zone/snapshot.ts";
import { KeyHints } from "../../components/KeyHint.tsx";
import { TextInput } from "../../components/TextInput.tsx";
import { Tabs } from "../../components/Tabs.tsx";
import { Divider } from "../../components/Divider.tsx";
import { SelectMenu, type SelectOption } from "../../components/SelectMenu.tsx";
import { SnapshotGalleryScreen } from "../../../screens/SnapshotGalleryScreen.js";
import { useHostMonitor } from "../../hooks/useHostMonitor.ts";
import { sparkline } from "../../utils/sparkline.ts";
import { MetricCard } from "../../components/design-system/index.ts";
import type { HostSnapshot } from "../../hooks/useHostMonitor.ts";
import { npmFindHost, npmEnableHost, npmDisableHost } from "../../npm-api.ts";

// ── Core Studio NPM host ───────────────────────────────────────────────────────
// NPM proxy host #129: studio.unenter.live → http://<control-node-ip>:3002
// This is the ONLY core resource intentionally kept local by default.
// [P] in CoreSection toggles it on/off without touching any other hosts.
const CORE_STUDIO_NPM_DOMAIN = `studio.${DOMAIN}`;
const CORE_STUDIO_PUBLIC_URL  = `https://${CORE_STUDIO_NPM_DOMAIN}/project/default`;

// ── Studio public URL helper ───────────────────────────────────────────────────
// Returns the public Studio URL with /project/default path.
// NOTE: we do NOT embed credentials in the URL — Chromium-based browsers
// (Brave, Chrome) block user:pass@url for sub-resource requests, causing 401s
// on JS/CSS/manifest fetches even though the initial navigation succeeds.
// Instead, pressing [u] also copies the password to clipboard so the user
// can paste it in the browser's native Basic Auth dialog (remembered after once).

function studioPublicUrl(inst: RuntimeInstance): string {
  const raw = inst.npmStudioUrl ?? instanceStudioPageUrl(inst);
  return raw.includes("/project/") ? raw : raw.replace(/\/?$/, "/project/default");
}

// ── Core service manifest ──────────────────────────────────────────────────────

const CORE_SERVICES = [
  { label: "Postgres",  container: "unt_db",       desc: "primary database (pg 15)" },
  { label: "Kong",      container: "unt_kong",      desc: "API gateway  :8001" },
  { label: "Auth",      container: "unt_auth",      desc: "GoTrue authentication" },
  { label: "Storage",   container: "unt_storage",   desc: "object / file storage" },
  { label: "Realtime",  container: "unt_realtime",  desc: "WebSocket broadcast" },
  { label: "Studio",    container: "unt_studio",    desc: "dashboard  :3002" },
  { label: "PostgREST", container: "unt_rest",      desc: "auto REST API" },
  { label: "Meta",      container: "unt_meta",      desc: "postgres-meta" },
  { label: "Imgproxy",  container: "unt_imgproxy",  desc: "image processing" },
] as const;

const CORE_OPTIONS: SelectOption[] = CORE_SERVICES.map((s) => ({
  id: s.container, label: s.label, desc: s.desc,
}));

// ── Virtual RuntimeInstance for core ──────────────────────────────────────────

const CORE_INSTANCE: RuntimeInstance = {
  id:              "core",
  name:            "Core Supabase",
  slug:            "unenter.live",
  containerPrefix: "unt_",
  status:          "active",
  createdAt:       "",
  runtimePath:     PROJECT_DIR,
  dockerPath:      PROJECT_DIR,
  ports: { kong: 8001, kongSSL: 8443, postgres: 5432, pooler: 0, analytics: 0, studio: 3002 },
  secrets: { postgresPassword: "", jwtSecret: "", anonKey: ANON_KEY, serviceRoleKey: SERVICE_KEY, dashboardPassword: "" },
  studioUrl:     STUDIO_PROJECT_URL,
  healthState:   "unknown",
  snapshotState: "none",
};

// ── Prop types ────────────────────────────────────────────────────────────────

export interface DbPanelProps {
  onLogs:              (container: string) => void;
  onBackup:            () => void;
  onCopy:              (text: string) => void;
  onStart:             () => void;
  onStop:              () => void;
  onRestart:           () => void;
  onHeal:              () => void;
  onVerify:            () => void;
  onGoBack:            () => void;
  onSubCrumbs:         (crumbs: string[]) => void;
  // ── Instance management ────────────────────────────────────────────────────
  onNewInstance:       () => void;
  onRestore:           (bundle: import("../../zone/snapshot.ts").SnapshotBundle, inst: RuntimeInstance) => void;
  onCloneFromSnapshot: (bundle: import("../../zone/snapshot.ts").SnapshotBundle) => void;
  onInstanceAction:    (action: "restart" | "stop" | "delete" | "snapshot" | "verify" | "npm", inst: RuntimeInstance) => void;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function truncKey(key: string, n = 42): string {
  if (!key) return "(not set)";
  return key.length > n ? key.slice(0, n) + "…" : key;
}

function healthColor(h: HealthState): string {
  switch (h) {
    case "healthy":  return "green";
    case "degraded": return "yellow";
    case "down":     return "red";
    default:         return "gray";
  }
}

function statusColor(s: RuntimeInstance["status"]): string {
  switch (s) {
    case "active":   return "green";
    case "creating": return "yellow";
    case "stopped":  return "gray";
    case "paused":   return "cyan";
    case "error":    return "red";
  }
}

function statusDot(s: RuntimeInstance["status"]): string {
  switch (s) {
    case "active":   return "●";
    case "creating": return "◌";
    case "stopped":  return "○";
    case "paused":   return "◎";
    case "error":    return "✗";
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── ActionGroup ────────────────────────────────────────────────────────────────

interface ActionGroupProps {
  label: string;
  hints: Array<{ k: string; label: string }>;
}

function ActionGroup({ label, hints }: ActionGroupProps) {
  return (
    <Box gap={2}>
      <Text bold color="cyan">{label.padEnd(8)}</Text>
      <Box gap={2} flexWrap="wrap">
        {hints.map(({ k, label: l }) => (
          <Box key={k} gap={0}>
            <Text color="cyan">[</Text>
            <Text bold color="white">{k}</Text>
            <Text color="cyan">]</Text>
            <Text dimColor> {l}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── InstanceDetail (inline summary in list view) ───────────────────────────────

interface InstanceDetailProps {
  inst:    RuntimeInstance;
  didCopy: boolean;
}

function InstanceDetail({ inst, didCopy }: InstanceDetailProps) {
  const localStudio = instanceStudioPageUrl(inst);
  const localApi    = `http://localhost:${inst.ports.kong}`;
  const pgConn      = postgresConnStr(inst.secrets.postgresPassword, inst.ports.postgres);
  // Public URLs — stored at provision time, or derived from name (short user slug) + domain.
  // inst.slug is the compose project name (e.g. "dcg-1779838801168"); inst.name is "dcg".
  const shortSlug   = inst.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const pubStudio   = inst.npmStudioUrl ?? `https://studio.${shortSlug}.${DOMAIN}`;
  const pubApi      = inst.npmApiUrl    ?? `https://db.${shortSlug}.${DOMAIN}`;

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>

      {/* Identity row */}
      <Box gap={2} marginBottom={0}>
        <Text bold>{inst.name}</Text>
        <Text color={statusColor(inst.status)}>{statusDot(inst.status)} {inst.status}</Text>
        <Text color={healthColor(inst.healthState)} dimColor>{inst.healthState}</Text>
        {inst.lastSnapshot && <Text dimColor>· snap {fmtDate(inst.lastSnapshot)}</Text>}
      </Box>

      {/* Local connections */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor bold>Local</Text>
        <Box gap={1}>
          <Text dimColor>{"  Studio  "}</Text>
          <Text color="green">{localStudio}</Text>
          <Text dimColor>  [u]</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"  API     "}</Text>
          <Text>{localApi}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"  PG      "}</Text>
          <Text dimColor>{pgConn}</Text>
        </Box>
      </Box>

      {/* Public connections (NPM-proxied) */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor bold>Public  <Text dimColor>(via NPM)</Text></Text>
        <Box gap={1}>
          <Text dimColor>{"  Studio  "}</Text>
          <Text color="cyan">{pubStudio}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"  API     "}</Text>
          <Text color="cyan">{pubApi}</Text>
        </Box>
      </Box>

      {/* Keys */}
      <Box flexDirection="column" marginTop={1}>
        <Box gap={1}>
          <Text dimColor>{"anon    "}</Text>
          <Text color="yellow" dimColor>{truncKey(inst.secrets.anonKey)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"svc     "}</Text>
          <Text color="yellow" dimColor>{truncKey(inst.secrets.serviceRoleKey)}</Text>
        </Box>
      </Box>

      {/* Copy feedback */}
      <Box marginTop={1} gap={3}>
        {didCopy
          ? <Text color="green">✓ copied to clipboard</Text>
          : <>
            <Text dimColor>[c] copy connection sheet</Text>
            <Text dimColor>[m] copy MCP config</Text>
            <Text dimColor>[↵] full detail</Text>
          </>
        }
      </Box>

    </Box>
  );
}

// ── InstanceDetailScreen (full-screen on [Enter]) ──────────────────────────────

interface InstanceDetailScreenProps {
  inst:             RuntimeInstance;
  onBack:           () => void;
  onCopy:           (text: string) => void;
  onInstanceAction: DbPanelProps["onInstanceAction"];
  onOpenGallery:    (inst: RuntimeInstance) => void;
}

function InstanceDetailScreen({
  inst, onBack, onCopy, onInstanceAction, onOpenGallery,
}: InstanceDetailScreenProps) {
  // Live copy of the instance so secrets update after a password change
  const [liveInst, setLiveInst] = useState<RuntimeInstance>(inst);
  const [didCopy,  setDidCopy]  = useState(false);
  // Admin-only screen — show credentials by default; [h] toggles them off
  const [showSecrets, setShowSecrets] = useState(true);
  // Edit mode: null = idle, "pg" = editing postgres password, "dash" = dashboard password
  const [editing, setEditing]  = useState<"pg" | "dash" | null>(null);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const updatingRef = useRef(false);

  // Auto-sync status from Docker on mount — registry status can be stale if the
  // instance was started/stopped outside the TUI (reboot, manual compose, etc.)
  useEffect(() => {
    let cancelled = false;
    void verifyCoreStack(liveInst).then((report) => {
      if (cancelled) return;
      const liveStatus: RuntimeInstance["status"] = report.runningCount > 0 ? "running" : "stopped";
      if (liveStatus !== liveInst.status || report.overall !== liveInst.healthState) {
        setLiveInst((prev) => ({ ...prev, status: liveStatus, healthState: report.overall }));
      }
    }).catch(() => { /* silent — user can press [v] for verbose */ });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst.id]);

  const localStudio = instanceStudioPageUrl(liveInst);
  const localApi    = `http://localhost:${liveInst.ports.kong}`;
  const pgConn      = postgresConnStr(liveInst.secrets.postgresPassword, liveInst.ports.postgres);
  const shortSlug   = liveInst.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const pubStudio   = liveInst.npmStudioUrl ?? `https://studio.${shortSlug}.${DOMAIN}`;
  const pubApi      = liveInst.npmApiUrl    ?? `https://db.${shortSlug}.${DOMAIN}`;

  const doCopy = useCallback((text: string) => {
    onCopy(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [onCopy]);

  useInput((input, key) => {
    if (editing) return;  // TextInput handles input while editing
    if (key.escape || input === "q") { onBack(); return; }
    if (input === "u") { doCopy(liveInst.secrets.dashboardPassword); void openBrowser(studioPublicUrl(liveInst)); return; }
    if (input === "U") { void openBrowser(localStudio); return; }
    if (input === "h") { setShowSecrets((v) => !v); return; }
    if (input === "e") { setEditing("pg");   setEditStatus(null); return; }
    if (input === "E") { setEditing("dash"); setEditStatus(null); return; }
    if (input === "c") {
      doCopy(buildConnectionSheet({
        label:        liveInst.name,
        kongUrl:      pubApi,
        studioUrl:    pubStudio,
        studioMcpUrl: instanceStudioMcpPageUrl(liveInst),
        anonKey:      liveInst.secrets.anonKey,
        svcKey:       liveInst.secrets.serviceRoleKey,
        pgConn,
      })); return;
    }
    if (input === "m") {
      doCopy(buildMcpConfig({
        kongUrl: pubApi,
        svcKey:  liveInst.secrets.serviceRoleKey,
        pgConn,
      })); return;
    }
    if (input === "r") { onInstanceAction("restart",  liveInst); return; }
    if (input === "x") { onInstanceAction("stop",     liveInst); return; }
    if (input === "v") { onInstanceAction("verify",   liveInst); return; }
    if (input === "s") { onInstanceAction("snapshot", liveInst); return; }
    if (input === "n") { onInstanceAction("npm",      liveInst); return; }
    if (input === "d") { onInstanceAction("delete",   liveInst); return; }
    if (input === "g") { onOpenGallery(liveInst); return; }
  });

  const handlePasswordSubmit = useCallback(async (newVal: string) => {
    if (!newVal || updatingRef.current) return;
    updatingRef.current = true;
    setEditStatus("Updating…");

    if (editing === "pg") {
      const lines: string[] = [];
      const ok = await updateInstancePassword(liveInst, newVal, (l) => lines.push(l));
      if (ok) {
        setLiveInst((prev) => ({
          ...prev,
          secrets: { ...prev.secrets, postgresPassword: newVal },
        }));
        setEditStatus("✓ PG password updated");
        setNeedsRestart(true);
      } else {
        setEditStatus(`✗ ${lines[lines.length - 1] ?? "update failed"}`);
      }
    } else if (editing === "dash") {
      const lines: string[] = [];
      const ok = await updateInstanceDashboardPassword(liveInst, newVal, (l) => lines.push(l));
      if (ok) {
        setLiveInst((prev) => ({
          ...prev,
          secrets: { ...prev.secrets, dashboardPassword: newVal },
        }));
        setEditStatus("✓ Dashboard password updated — Kong reloaded");
      } else {
        setEditStatus(`✗ ${lines[lines.length - 1] ?? "update failed"}`);
      }
    }

    setEditing(null);
    updatingRef.current = false;
  }, [editing, liveInst]);

  const LabelCol = 12;
  const masked   = (s: string) => showSecrets ? s : "•".repeat(Math.min(s.length, 20));

  return (
    <Box flexDirection="column" paddingX={1}>

      {/* Header */}
      <Box gap={2} marginBottom={1}>
        <Text bold color="magenta">⬡  {liveInst.name}</Text>
        <Text color={statusColor(liveInst.status)}>{statusDot(liveInst.status)} {liveInst.status}</Text>
        <Text color={healthColor(liveInst.healthState)} dimColor>{liveInst.healthState}</Text>
        {liveInst.lastSnapshot && <Text dimColor>· snap {fmtDate(liveInst.lastSnapshot)}</Text>}
        {needsRestart && <Text color="yellow"> ⚠ restart recommended</Text>}
      </Box>

      {/* ── Public connections ── */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">Public  <Text dimColor color="cyan">(nginx proxy manager · {DOMAIN})</Text></Text>
        <Box gap={1} marginTop={0}>
          <Text dimColor>{"  Studio".padEnd(LabelCol)}</Text>
          <Text color="cyan">{pubStudio}</Text>
          <Text dimColor>  [u]</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"  API".padEnd(LabelCol)}</Text>
          <Text color="cyan">{pubApi}</Text>
        </Box>
      </Box>

      {/* ── Local connections ── */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold dimColor>Local  <Text dimColor>(direct · no SSL)</Text></Text>
        <Box gap={1} marginTop={0}>
          <Text dimColor>{"  Studio".padEnd(LabelCol)}</Text>
          <Text color="green">{localStudio}</Text>
          <Text dimColor>  [U]</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"  API".padEnd(LabelCol)}</Text>
          <Text>{localApi}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"  Postgres".padEnd(LabelCol)}</Text>
          <Text dimColor>{pgConn}</Text>
        </Box>
      </Box>

      {/* ── Credentials ── */}
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={2}>
          <Text bold dimColor>Credentials</Text>
          <Text dimColor>[h] {showSecrets ? "hide" : "show"}</Text>
        </Box>

        {/* PG */}
        <Box gap={1} marginTop={0} alignItems="center">
          <Text dimColor>{"  PG user".padEnd(LabelCol)}</Text>
          <Text>postgres</Text>
        </Box>
        <Box gap={1} alignItems="center">
          <Text dimColor>{"  PG pass".padEnd(LabelCol)}</Text>
          {editing === "pg" ? (
            <TextInput
              active
              width={36}
              placeholder="new password…"
              onSubmit={(v) => { void handlePasswordSubmit(v); }}
              onCancel={() => { setEditing(null); setEditStatus(null); }}
            />
          ) : (
            <>
              <Text color={showSecrets ? "yellow" : "gray"}>{masked(liveInst.secrets.postgresPassword)}</Text>
              <Text dimColor>  [e] edit</Text>
            </>
          )}
        </Box>

        {/* Dashboard */}
        <Box gap={1} alignItems="center">
          <Text dimColor>{"  Studio user".padEnd(LabelCol)}</Text>
          <Text>{liveInst.name}</Text>
        </Box>
        <Box gap={1} alignItems="center">
          <Text dimColor>{"  Studio pass".padEnd(LabelCol)}</Text>
          {editing === "dash" ? (
            <TextInput
              active
              width={36}
              placeholder="new password…"
              onSubmit={(v) => { void handlePasswordSubmit(v); }}
              onCancel={() => { setEditing(null); setEditStatus(null); }}
            />
          ) : (
            <>
              <Text color={showSecrets ? "yellow" : "gray"}>{masked(liveInst.secrets.dashboardPassword)}</Text>
              <Text dimColor>  [E] edit</Text>
            </>
          )}
        </Box>

        {/* API Keys */}
        <Box gap={1} marginTop={1}>
          <Text dimColor>{"  anon key".padEnd(LabelCol)}</Text>
          <Text color="yellow" dimColor>{truncKey(liveInst.secrets.anonKey, 52)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"  svc key".padEnd(LabelCol)}</Text>
          <Text color="yellow" dimColor>{truncKey(liveInst.secrets.serviceRoleKey, 52)}</Text>
        </Box>
      </Box>

      {/* Status / feedback */}
      {editStatus && (
        <Box marginBottom={1}>
          <Text color={editStatus.startsWith("✓") ? "green" : editStatus.startsWith("✗") ? "red" : "yellow"}>
            {editStatus}
          </Text>
        </Box>
      )}
      {didCopy && <Text color="green" dimColor>✓ copied to clipboard</Text>}

      {/* ── Actions ── */}
      {!editing && (
        <Box flexDirection="column" marginTop={1} gap={0}>
          <ActionGroup label="Connect" hints={[
            { k: "u", label: "open Studio (public)"  },
            { k: "U", label: "open Studio (local)"   },
            { k: "c", label: "copy conn. sheet"      },
            { k: "m", label: "copy MCP config"       },
          ]} />
          <ActionGroup label="Creds" hints={[
            { k: "h", label: showSecrets ? "hide secrets" : "show secrets" },
            { k: "e", label: "edit PG password"       },
            { k: "E", label: "edit Studio password"   },
          ]} />
          <ActionGroup label="Operate" hints={[
            { k: "r", label: "restart"       },
            { k: "x", label: "stop"          },
            { k: "v", label: "verify"        },
            { k: "n", label: "re-register NPM" },
            { k: "d", label: "delete"        },
          ]} />
          <ActionGroup label="Protect" hints={[
            { k: "s", label: "snapshot" },
            { k: "g", label: "gallery"  },
          ]} />
        </Box>
      )}

      {!editing && (
        <KeyHints hints={[
          { k: "esc/q", label: "back"         },
          { k: "h",     label: "show/hide"    },
          { k: "e/E",   label: "edit creds"   },
          { k: "u",     label: "open Studio"  },
          { k: "c/m",   label: "copy sheet/MCP" },
        ]} />
      )}

    </Box>
  );
}

// ── Section 1 — Core Supabase ──────────────────────────────────────────────────

function CoreSection({
  onLogs, onStart, onStop, onRestart, onHeal, onBackup, onVerify,
  onCopy, onOpenGallery, onNewInstance, hostSnapshot,
}: {
  onLogs:         (container: string) => void;
  onStart:        () => void;
  onStop:         () => void;
  onRestart:      () => void;
  onHeal:         () => void;
  onBackup:       () => void;
  onVerify:       () => void;
  onCopy:         (text: string) => void;
  onOpenGallery:  () => void;
  onNewInstance:  () => void;
  hostSnapshot:   HostSnapshot;
}) {
  const [didCopy,        setDidCopy]        = useState(false);
  // null = unknown (loading), true = public, false = local-only
  const [studioPublic,   setStudioPublic]   = useState<boolean | null>(null);
  const [studioToggling, setStudioToggling] = useState(false);
  const [studioError,    setStudioError]    = useState<string | null>(null);

  // Fetch current NPM state on mount
  useEffect(() => {
    let cancelled = false;
    npmFindHost(CORE_STUDIO_NPM_DOMAIN)
      .then((host) => { if (!cancelled) setStudioPublic(host ? host.enabled === 1 : false); })
      .catch(() => { if (!cancelled) setStudioPublic(false); });
    return () => { cancelled = true; };
  }, []);

  const toggleStudioPublic = useCallback(async () => {
    if (studioToggling || studioPublic === null) return;
    setStudioToggling(true);
    setStudioError(null);
    try {
      const host = await npmFindHost(CORE_STUDIO_NPM_DOMAIN);
      if (!host) { setStudioError("NPM host not found — run unaxis npm to set it up"); return; }
      if (studioPublic) {
        await npmDisableHost(host.id);
        setStudioPublic(false);
      } else {
        await npmEnableHost(host.id);
        setStudioPublic(true);
      }
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : String(err));
    } finally {
      setStudioToggling(false);
    }
  }, [studioPublic, studioToggling]);

  const doCopy = useCallback((text: string) => {
    onCopy(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [onCopy]);

  useInput((input) => {
    if (input === "u") {
      if (studioPublic) {
        void openBrowser(CORE_STUDIO_PUBLIC_URL);
      } else {
        void openBrowser(STUDIO_PROJECT_URL);
      }
      return;
    }
    if (input === "P") { void toggleStudioPublic(); return; }
    if (input === "s") { onStart();   return; }
    if (input === "x") { onStop();    return; }
    if (input === "r") { onRestart(); return; }
    if (input === "h") { onHeal();    return; }
    if (input === "b") { onBackup();  return; }
    if (input === "v") { onVerify();  return; }
    if (input === "g") { onOpenGallery(); return; }
    if (input === "c") { doCopy(buildConnectionSheet()); return; }
    if (input === "m") { doCopy(buildMcpConfig()); return; }
    if (input === "n") { onNewInstance(); return; }
  });

  return (
    <Box flexDirection="column">

      {/* Identity */}
      <Box paddingX={1} paddingBottom={1} gap={2} alignItems="center">
        <Text bold color="cyan">◈  Core Supabase</Text>
        <Text dimColor>primary control-plane DB  ·  zones attached  ·  MCP ready</Text>
      </Box>

      {/* Quick-access URLs */}
      <Box flexDirection="column" paddingX={1} paddingBottom={1}>
        <Box gap={1} alignItems="center">
          <Text dimColor>{"Studio  "}</Text>
          {studioPublic === null && <Text dimColor>{STUDIO_PROJECT_URL}</Text>}
          {studioPublic === true  && <Text color="cyan">{CORE_STUDIO_PUBLIC_URL}</Text>}
          {studioPublic === false && <Text color="green">{STUDIO_PROJECT_URL}</Text>}
          <Text dimColor>  [u]</Text>
          {studioPublic === null     && <Text dimColor>  ···</Text>}
          {studioPublic === true     && <Text color="cyan">  ● public</Text>}
          {studioPublic === false    && <Text dimColor>  ○ local</Text>}
          {studioToggling            && <Text color="yellow">  toggling…</Text>}
        </Box>
        {studioError && (
          <Box paddingLeft={10}>
            <Text color="red">{studioError}</Text>
          </Box>
        )}
        <Box gap={1}>
          <Text dimColor>{"API     "}</Text>
          <Text>{KONG_URL}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"Postgres"}</Text>
          <Text dimColor>{postgresConnStr()}</Text>
        </Box>
      </Box>

      {/* Live metrics */}
      <Box gap={1} paddingX={1} paddingBottom={1}>
        <MetricCard
          label="System CPU"
          value={`${hostSnapshot.systemCpu.toFixed(1)}%`}
          note="active time"
          tone={hostSnapshot.systemCpu > 80 ? "error" : hostSnapshot.systemCpu > 50 ? "warning" : "success"}
          trend={sparkline(hostSnapshot.cpuHistory)}
        />
        <MetricCard
          label="Host Memory"
          value={formatBytes(hostSnapshot.usedMemory)}
          note={`${formatBytes(hostSnapshot.freeMemory)} free`}
          tone={hostSnapshot.memoryPressure > 0.9 ? "error" : hostSnapshot.memoryPressure > 0.7 ? "warning" : "success"}
          trend={sparkline(hostSnapshot.memHistory)}
        />
      </Box>

      <Divider />

      {/* Action groups */}
      <Box flexDirection="column" paddingX={1} paddingTop={1} paddingBottom={1} gap={0}>
        <ActionGroup label="Operate" hints={[
          { k: "s", label: "start"   },
          { k: "x", label: "stop"    },
          { k: "r", label: "restart" },
          { k: "h", label: "heal"    },
          { k: "v", label: "verify"  },
        ]} />
        <ActionGroup label="Protect" hints={[
          { k: "b", label: "snapshot" },
          { k: "g", label: "gallery"  },
        ]} />
        <ActionGroup label="Connect" hints={[
          { k: "u", label: studioPublic ? "open Studio (public)" : "open Studio (local)" },
          { k: "P", label: studioPublic ? "make Studio local-only" : "make Studio public" },
          { k: "c", label: "copy conn. sheet" },
          { k: "m", label: "copy MCP config"  },
        ]} />
        <ActionGroup label="Branch" hints={[
          { k: "n", label: "new blank instance" },
          { k: "2", label: "→ Instances"        },
          { k: "3", label: "→ Snapshots"        },
        ]} />
      </Box>

      <Divider title="Core Services" />

      {/* Services list — selectable for logs */}
      <Box paddingX={1} paddingBottom={0}>
        <SelectMenu options={CORE_OPTIONS} onSelect={(opt) => onLogs(opt.id)} searchable={false} />
      </Box>

      <Divider />

      {/* API keys */}
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Box gap={1}>
          <Text dimColor>{"anon    "}</Text>
          <Text color="yellow" dimColor>{truncKey(ANON_KEY)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"svc     "}</Text>
          <Text color="yellow" dimColor>{truncKey(SERVICE_KEY)}</Text>
        </Box>
      </Box>
      <Box paddingX={1} paddingTop={1} gap={3}>
        {didCopy
          ? <Text color="green">✓ copied to clipboard</Text>
          : <>
            <Text dimColor>[c] copy connection sheet</Text>
            <Text dimColor>[m] copy MCP config</Text>
          </>
        }
      </Box>

      <KeyHints hints={[
        { k: "↑↓/jk", label: "services" },
        { k: "↵",      label: "logs"     },
        { k: "2",      label: "instances" },
        { k: "3",      label: "snapshots" },
      ]} />

    </Box>
  );
}

// ── Section 2 — Runtime Instances ─────────────────────────────────────────────

function InstancesSection({
  instances, detailInst, onSetDetailInst, onInstanceAction, onNewInstance, onOpenGallery, onCopy, onRefresh,
}: {
  instances:        RuntimeInstance[];
  detailInst:       RuntimeInstance | null;
  onSetDetailInst:  (inst: RuntimeInstance | null) => void;
  onInstanceAction: DbPanelProps["onInstanceAction"];
  onNewInstance:    () => void;
  onOpenGallery:    (inst: RuntimeInstance) => void;
  onCopy:           (text: string) => void;
  onRefresh:        () => void;
}) {
  const [highlighted, setHighlighted] = useState<RuntimeInstance | null>(instances[0] ?? null);
  const [didCopy, setDidCopy]         = useState(false);

  useEffect(() => {
    if (!highlighted && instances.length > 0) setHighlighted(instances[0]);
  }, [instances, highlighted]);

  const doCopy = useCallback((text: string) => {
    onCopy(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [onCopy]);

  const instanceOptions: SelectOption[] = instances.map((inst) => ({
    id:    inst.id,
    label: inst.name,
    desc:  `${statusDot(inst.status)} ${inst.status.padEnd(8)}  Kong:${inst.ports.kong}  PG:${inst.ports.postgres}  ${fmtDate(inst.createdAt)}`,
  }));

  useInput((input) => {
    if (detailInst) return;
    if (!highlighted) { if (input === "n") onNewInstance(); return; }
    if (input === "u") { doCopy(highlighted.secrets.dashboardPassword); void openBrowser(studioPublicUrl(highlighted)); return; }
    if (input === "c") {
      doCopy(buildConnectionSheet({
        label:        highlighted.name,
        kongUrl:      `http://localhost:${highlighted.ports.kong}`,
        studioUrl:    instanceStudioPageUrl(highlighted),
        studioMcpUrl: instanceStudioMcpPageUrl(highlighted),
        anonKey:      highlighted.secrets.anonKey,
        svcKey:       highlighted.secrets.serviceRoleKey,
        pgConn:       postgresConnStr(highlighted.secrets.postgresPassword, highlighted.ports.postgres),
      })); return;
    }
    if (input === "m") {
      doCopy(buildMcpConfig({
        kongUrl: `http://localhost:${highlighted.ports.kong}`,
        svcKey:  highlighted.secrets.serviceRoleKey,
        pgConn:  postgresConnStr(highlighted.secrets.postgresPassword, highlighted.ports.postgres),
      })); return;
    }
    if (input === "r") { onInstanceAction("restart",  highlighted); return; }
    if (input === "x") { onInstanceAction("stop",     highlighted); return; }
    if (input === "d") { onInstanceAction("delete",   highlighted); return; }
    if (input === "s") { onInstanceAction("snapshot", highlighted); return; }
    if (input === "v") { onInstanceAction("verify",   highlighted); return; }
    if (input === "n") { onInstanceAction("npm",      highlighted); return; }
    if (input === "g") { onOpenGallery(highlighted); return; }
    if (input === "N") { onNewInstance(); return; }
    if (input === "f") { onRefresh(); return; }
  });

  if (detailInst) {
    return (
      <InstanceDetailScreen
        inst={detailInst}
        onBack={() => onSetDetailInst(null)}
        onCopy={onCopy}
        onInstanceAction={onInstanceAction}
        onOpenGallery={onOpenGallery}
      />
    );
  }

  return (
    <Box flexDirection="column">

      <Box paddingX={1} paddingBottom={1} gap={2} alignItems="center">
        <Text bold color="magenta">⬡  Runtime Instances</Text>
        <Text dimColor>deployed branches · NPM-proxied · public URLs</Text>
        {instances.length > 0 && (
          <Text dimColor>· {instances.length} instance{instances.length !== 1 ? "s" : ""}</Text>
        )}
      </Box>

      {instances.length === 0 ? (

        <Box flexDirection="column" paddingX={2} gap={1}>
          <Text dimColor>No runtime instances yet.</Text>
          <Box flexDirection="column" paddingTop={1} gap={0}>
            <Text dimColor bold>Create one:</Text>
            <Text dimColor>  [N] blank instance  — fresh DB, gets its own domain via NPM</Text>
            <Text dimColor>  [3] → Snapshots      — clone from a captured snapshot</Text>
          </Box>
          <Box paddingTop={1} gap={2}>
            <Text color="magenta">[N] new instance</Text>
            <Text dimColor>[1] → Core</Text>
            <Text dimColor>[3] → Snapshots</Text>
          </Box>
        </Box>

      ) : (
        <>
          <Box paddingX={1}>
            <SelectMenu
              options={instanceOptions}
              onSelect={(opt) => onSetDetailInst(instances.find((i) => i.id === opt.id) ?? null)}
              onHighlight={(opt) => setHighlighted(instances.find((i) => i.id === opt.id) ?? null)}
              searchable={false}
            />
          </Box>

          <Divider />

          {highlighted && <InstanceDetail inst={highlighted} didCopy={didCopy} />}

          <Box flexDirection="column" paddingX={1} paddingTop={1} paddingBottom={1} gap={0}>
            <ActionGroup label="Operate" hints={[
              { k: "r", label: "restart"  },
              { k: "x", label: "stop"     },
              { k: "v", label: "verify"   },
              { k: "d", label: "delete"   },
            ]} />
            <ActionGroup label="Protect" hints={[
              { k: "s", label: "snapshot" },
              { k: "g", label: "gallery"  },
            ]} />
            <ActionGroup label="Connect" hints={[
              { k: "u", label: "open Studio"      },
              { k: "c", label: "copy conn. sheet" },
              { k: "m", label: "copy MCP config"  },
            ]} />
            <ActionGroup label="New / Infra" hints={[
              { k: "N", label: "new blank instance"  },
              { k: "n", label: "re-register NPM"     },
              { k: "f", label: "refresh list"        },
            ]} />
          </Box>
        </>
      )}

      <KeyHints hints={[
        { k: "↑↓/jk", label: "navigate"    },
        { k: "↵",      label: "full detail" },
        { k: "s",      label: "snapshot"    },
        { k: "d",      label: "delete"      },
        { k: "f",      label: "refresh"     },
        { k: "1",      label: "→ Core"      },
        { k: "3",      label: "→ Snapshots" },
      ]} />

    </Box>
  );
}

// ── Section 3 — Snapshots ──────────────────────────────────────────────────────

interface SnapshotRow {
  bundle:       SnapshotBundle;
  instanceName: string;
  isCore:       boolean;
}

function SnapshotsSection({
  onRestore, onClone, onCopy,
}: {
  onRestore: (bundle: SnapshotBundle, inst: RuntimeInstance) => void;
  onClone:   (bundle: SnapshotBundle) => void;
  onCopy:    (text: string) => void;
}) {
  const [rows,    setRows]    = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlighted, setHighlighted] = useState<SnapshotRow | null>(null);
  const [didCopy, setDidCopy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all: SnapshotRow[] = [];

      // Core snapshots
      const coreSnaps = await listSnapshots(CORE_INSTANCE);
      for (const b of coreSnaps) {
        all.push({ bundle: b, instanceName: "Core Supabase", isCore: true });
      }

      // Runtime instance snapshots
      const instances = await loadRegistry();
      for (const inst of instances) {
        const snaps = await listSnapshots(inst);
        for (const b of snaps) {
          all.push({ bundle: b, instanceName: inst.name, isCore: false });
        }
      }

      // Snapshots from deleted instances (orphan backups on disk)
      const knownSlugs = [CORE_INSTANCE.slug, ...instances.map((i) => i.slug)];
      const orphans = await listOrphanSnapshots(knownSlugs);
      for (const b of orphans) {
        all.push({ bundle: b, instanceName: `${b.instanceName} ✕`, isCore: false });
      }

      // Sort newest first
      all.sort((a, b) => b.bundle.createdAt.localeCompare(a.bundle.createdAt));
      setRows(all);
      setHighlighted(all[0] ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const doCopy = useCallback((text: string) => {
    onCopy(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [onCopy]);

  useInput((input) => {
    if (input === "f") { void load(); return; }
    if (!highlighted) return;
    if (input === "p") {
      doCopy(highlighted.bundle.bundlePath);
      return;
    }
    if (input === "k") {
      onClone(highlighted.bundle);
      return;
    }
    if (input === "r") {
      void loadRegistry().then((insts) => {
        const inst = highlighted.isCore
          ? CORE_INSTANCE
          : insts.find((i) => i.id === highlighted.bundle.instanceId) ?? CORE_INSTANCE;
        onRestore(highlighted.bundle, inst);
      });
    }
  });

  const snapshotOptions: SelectOption[] = rows.map((row) => ({
    id:    row.bundle.id,
    label: row.bundle.id,
    desc:  `${row.isCore ? "◈ core" : "⬡ " + row.instanceName}  ·  ${fmtDate(row.bundle.createdAt)}`,
  }));

  return (
    <Box flexDirection="column">

      {/* Section identity */}
      <Box paddingX={1} paddingBottom={1} gap={2} alignItems="center">
        <Text bold color="yellow">◆  Snapshots</Text>
        <Text dimColor>captured states across core + instances</Text>
        {!loading && rows.length > 0 && (
          <Text dimColor>· {rows.length} total</Text>
        )}
      </Box>

      {loading ? (
        <Box paddingX={2}><Text dimColor>Loading snapshots…</Text></Box>
      ) : rows.length === 0 ? (
        <Box flexDirection="column" paddingX={2} gap={1}>
          <Text dimColor>No snapshots yet.</Text>
          <Box flexDirection="column" paddingTop={1} gap={0}>
            <Text dimColor>  [1] → Core Supabase and press [b] to capture one</Text>
            <Text dimColor>  [2] → Instances, select one, press [s] to snapshot it</Text>
          </Box>
        </Box>
      ) : (
        <>
          {/* Snapshot list */}
          <Box paddingX={1}>
            <SelectMenu
              options={snapshotOptions}
              onSelect={(opt) => {
                const row = rows.find((r) => r.bundle.id === opt.id);
                if (row) setHighlighted(row);
              }}
              onHighlight={(opt) => {
                setHighlighted(rows.find((r) => r.bundle.id === opt.id) ?? null);
              }}
              searchable={false}
            />
          </Box>

          <Divider />

          {/* Selected snapshot detail */}
          {highlighted && (
            <Box flexDirection="column" paddingX={1} marginTop={1} gap={0}>
              <Box gap={2}>
                <Text bold>{highlighted.bundle.id}</Text>
                <Text dimColor>{highlighted.isCore ? "◈ Core Supabase" : `⬡ ${highlighted.instanceName}`}</Text>
              </Box>
              <Box gap={1} marginTop={1}>
                <Text dimColor>{"Created "}</Text>
                <Text>{fmtDate(highlighted.bundle.createdAt)}</Text>
              </Box>
              <Box gap={1}>
                <Text dimColor>{"Path    "}</Text>
                <Text dimColor>{highlighted.bundle.bundlePath}</Text>
              </Box>
              {highlighted.bundle.archivePath && (
                <Box gap={1}>
                  <Text dimColor>{"Archive "}</Text>
                  <Text dimColor>{highlighted.bundle.archivePath}</Text>
                </Box>
              )}
              <Box marginTop={1} gap={3}>
                {didCopy
                  ? <Text color="green">✓ path copied</Text>
                  : <>
                    <Text dimColor>[k] clone as new instance</Text>
                    <Text dimColor>[r] restore into instance</Text>
                    <Text dimColor>[p] copy path</Text>
                  </>
                }
              </Box>
            </Box>
          )}

          {/* Actions */}
          <Box flexDirection="column" paddingX={1} paddingTop={1} paddingBottom={1} gap={0}>
            <ActionGroup label="Clone" hints={[
              { k: "k", label: "clone as new independent instance" },
            ]} />
            <ActionGroup label="Restore" hints={[
              { k: "r", label: "restore into existing instance" },
            ]} />
            <ActionGroup label="Copy" hints={[
              { k: "p", label: "copy bundle path" },
              { k: "f", label: "refresh list" },
            ]} />
          </Box>
        </>
      )}

      <KeyHints hints={[
        { k: "↑↓/jk", label: "navigate" },
        { k: "k",      label: "clone"    },
        { k: "r",      label: "restore"  },
        { k: "f",      label: "refresh"  },
        { k: "1",      label: "→ Core"   },
        { k: "2",      label: "→ Instances" },
      ]} />

    </Box>
  );
}

// ── DbPanel — main ────────────────────────────────────────────────────────────
// Tabs: [1] Core Supabase  [2] Runtime Instances  [3] Snapshots

type DbSection = "core" | "instances" | "snapshots";

export function DbPanel({
  onLogs, onBackup, onCopy, onStart, onStop, onRestart, onHeal, onVerify,
  onGoBack, onSubCrumbs, onNewInstance, onRestore, onCloneFromSnapshot, onInstanceAction,
}: DbPanelProps) {

  const [section,         setSection]         = useState<DbSection>("core");
  const [instances,       setInstances]       = useState<RuntimeInstance[]>([]);
  const [galleryInstance, setGalleryInstance] = useState<RuntimeInstance | null>(null);
  const [detailInst,      setDetailInst]      = useState<RuntimeInstance | null>(null);

  const hostSnapshot = useHostMonitor();

  useEffect(() => {
    if (section !== "instances") return;
    let cancelled = false;
    loadRegistry().then((list) => { if (!cancelled) setInstances(list); });
    return () => { cancelled = true; };
  }, [section]);

  const refreshInstances = useCallback(() => { loadRegistry().then(setInstances); }, []);

  // Breadcrumb sync
  useEffect(() => {
    if (galleryInstance) {
      onSubCrumbs(galleryInstance.id === "core"
        ? ["gallery"]
        : ["instances", `${galleryInstance.name} · gallery`]);
    } else if (detailInst) {
      onSubCrumbs(["instances", detailInst.name]);
    } else if (section === "instances") {
      onSubCrumbs(["instances"]);
    } else if (section === "snapshots") {
      onSubCrumbs(["snapshots"]);
    } else {
      onSubCrumbs([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryInstance, detailInst, section]);

  useInput((input, key) => {
    if (galleryInstance !== null) return;
    if (detailInst !== null) return;
    if (input === "1") { setDetailInst(null); setSection("core");      return; }
    if (input === "2") { setDetailInst(null); setSection("instances"); return; }
    if (input === "3") { setDetailInst(null); setSection("snapshots"); return; }
    if (input === "q" || key.leftArrow) { onGoBack(); return; }
  });

  if (galleryInstance !== null) {
    return (
      <SnapshotGalleryScreen
        instance={galleryInstance}
        onRestore={(bundle) => {
          setGalleryInstance(null);
          onRestore(bundle, galleryInstance);
        }}
        onBack={() => setGalleryInstance(null)}
      />
    );
  }

  const activeTab =
    section === "core"      ? "Core Supabase"      :
    section === "instances" ? "Runtime Instances"  :
                              "Snapshots";

  return (
    <Box flexDirection="column">

      <Tabs
        tabs={["Core Supabase", "Runtime Instances", "Snapshots"]}
        active={activeTab}
        marginBottom={1}
      />

      {section === "core" && (
        <CoreSection
          onLogs={onLogs}
          onStart={onStart}
          onStop={onStop}
          onRestart={onRestart}
          onHeal={onHeal}
          onBackup={onBackup}
          onVerify={onVerify}
          onCopy={onCopy}
          onOpenGallery={() => setGalleryInstance(CORE_INSTANCE)}
          onNewInstance={() => { setSection("instances"); onNewInstance(); }}
          hostSnapshot={hostSnapshot}
        />
      )}

      {section === "instances" && (
        <InstancesSection
          instances={instances}
          detailInst={detailInst}
          onSetDetailInst={setDetailInst}
          onInstanceAction={onInstanceAction}
          onNewInstance={onNewInstance}
          onOpenGallery={setGalleryInstance}
          onCopy={onCopy}
          onRefresh={refreshInstances}
        />
      )}

      {section === "snapshots" && (
        <SnapshotsSection
          onRestore={onRestore}
          onClone={onCloneFromSnapshot}
          onCopy={onCopy}
        />
      )}

    </Box>
  );
}
