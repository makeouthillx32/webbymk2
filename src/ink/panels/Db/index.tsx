// src/ink/panels/Db/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Database panel — Core Supabase mothership + Runtime Instances (branches/labs).
//
// Philosophy:
//   Core Supabase is the primary control-plane database that the entire
//   platform runs on — website, zones, TUI, MCP, storage, auth.  It is the
//   source of truth and is treated as sacred.
//
//   Runtime Instances are branches: clones, blank runtimes, or seeded envs
//   spun off for staging, testing, experiments, or side projects.  These are
//   where you experiment — not Core.
//
// Layout (Core tab):
//   Identity block     — name, role, status badges
//   Quick-access URLs  — Studio · API · Postgres on one compact row
//   Metrics row        — CPU + memory sparklines
//   Action groups      — Operate · Protect · Connect · Branch (visual sections)
//   Core Services      — compact status list (supporting detail, not main event)
//   Keys               — anon + svc_role with copy shortcuts
//
// Layout (Runtime Instances tab):
//   Instance list      — name · mode · status columns
//   Detail panel       — URLs, mode, ports, last snapshot for selected instance
//   Action bar         — per-instance operations
//
// ┌─ [Tab] section switch ─────────────────────────────────────────────────────┐
// │  Core Supabase                     Runtime Instances                       │
// └────────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { openBrowser } from "@/utils/browser.ts";
import {
  KONG_URL, STUDIO_PROJECT_URL, ANON_KEY, SERVICE_KEY,
  postgresConnStr, instanceStudioUrl, instanceStudioMcpUrl,
  buildConnectionSheet, buildMcpConfig,
} from "../../db-api.ts";
import { loadRegistry } from "../../zone/supabase-factory.ts";
import type { RuntimeInstance, HealthState } from "../../zone/supabase-factory.ts";
import { PROJECT_DIR } from "../../../config/stack.ts";
import type { SnapshotBundle } from "../../zone/snapshot.ts";
import { KeyHints } from "../../components/KeyHint.tsx";
import { Tabs } from "../../components/Tabs.tsx";
import { Divider } from "../../components/Divider.tsx";
import { SelectMenu, type SelectOption } from "../../components/SelectMenu.tsx";
import { SnapshotGalleryScreen } from "../../../screens/SnapshotGalleryScreen.js";
import { useHostMonitor } from "../../hooks/useHostMonitor.ts";
import { sparkline } from "../../utils/sparkline.ts";
import { MetricCard } from "../../components/design-system/index.ts";
import type { HostSnapshot } from "../../hooks/useHostMonitor.ts";

// ── Core service manifest ──────────────────────────────────────────────────────
// Ordered: primary services first, infrastructure support last.

const CORE_SERVICES = [
  { label: "Postgres", container: "unt_db", desc: "primary database (pg 15)" },
  { label: "Kong", container: "unt_kong", desc: "API gateway  :8001" },
  { label: "Auth", container: "unt_auth", desc: "GoTrue authentication" },
  { label: "Storage", container: "unt_storage", desc: "object / file storage" },
  { label: "Realtime", container: "unt_realtime", desc: "WebSocket broadcast" },
  { label: "Studio", container: "unt_studio", desc: "dashboard  :3002" },
  { label: "PostgREST", container: "unt_rest", desc: "auto REST API" },
  { label: "Meta", container: "unt_meta", desc: "postgres-meta" },
  { label: "Imgproxy", container: "unt_imgproxy", desc: "image processing" },
] as const;

const CORE_OPTIONS: SelectOption[] = CORE_SERVICES.map((s) => ({
  id: s.container,
  label: s.label,
  desc: s.desc,
}));

// ── Virtual RuntimeInstance for core (not in instances.json) ──────────────────

const CORE_INSTANCE: RuntimeInstance = {
  id: "core",
  name: "Core Supabase",
  slug: "core",
  status: "active",
  createdAt: "",
  runtimePath: PROJECT_DIR,
  dockerPath: PROJECT_DIR,
  ports: {
    kong: 8001,
    kongSSL: 8443,
    postgres: 5432,
    pooler: 0,
    analytics: 0,
    studio: 3002,
  },
  secrets: {
    postgresPassword: "",
    jwtSecret: "",
    anonKey: ANON_KEY,
    serviceRoleKey: SERVICE_KEY,
    dashboardPassword: "",
  },
  studioUrl: STUDIO_PROJECT_URL,
  healthState: "unknown",
  snapshotState: "none",
};

// ── Prop types ────────────────────────────────────────────────────────────────

export interface DbPanelProps {
  onLogs: (container: string) => void;
  onBackup: () => void;
  onCopy: (text: string) => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onHeal: () => void;
  onVerify: () => void;
  onNewInstance: () => void;
  onRestore: (bundle: SnapshotBundle, instance: RuntimeInstance) => void;
  onInstanceAction: (
    action: "restart" | "stop" | "delete" | "snapshot" | "verify",
    instance: RuntimeInstance,
  ) => void;
  onGoBack: () => void;
  onSubCrumbs: (crumbs: string[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncKey(key: string, n = 42): string {
  if (!key) return "(not set)";
  return key.length > n ? key.slice(0, n) + "…" : key;
}

function healthColor(h: HealthState): string {
  switch (h) {
    case "healthy": return "green";
    case "degraded": return "yellow";
    case "down": return "red";
    default: return "gray";
  }
}

function statusColor(s: RuntimeInstance["status"]): string {
  switch (s) {
    case "active": return "green";
    case "creating": return "yellow";
    case "stopped": return "gray";
    case "paused": return "cyan";
    case "error": return "red";
  }
}

function statusDot(s: RuntimeInstance["status"]): string {
  switch (s) {
    case "active": return "●";
    case "creating": return "◌";
    case "stopped": return "○";
    case "paused": return "◎";
    case "error": return "✗";
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ── ActionGroup ────────────────────────────────────────────────────────────────
// Visual label + row of styled key hints.  Pure display — no interaction.

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

// ── InstanceDetail ─────────────────────────────────────────────────────────────
// Compact per-instance connection + metadata pane shown below the list.

interface InstanceDetailProps {
  inst: RuntimeInstance;
  didCopy: boolean;
}

function InstanceDetail({ inst, didCopy }: InstanceDetailProps) {
  const studioUrl = instanceStudioUrl(inst.ports.studio);
  const apiUrl = `http://localhost:${inst.ports.kong}`;
  const pgConn = postgresConnStr(inst.secrets.postgresPassword);

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>

      {/* Instance identity row */}
      <Box gap={2} marginBottom={0}>
        <Text bold>{inst.name}</Text>
        <Text color={statusColor(inst.status)}>
          {statusDot(inst.status)} {inst.status}
        </Text>
        <Text color={healthColor(inst.healthState)}>{inst.healthState}</Text>
        {inst.lastSnapshot && (
          <Text dimColor>snap {new Date(inst.lastSnapshot).toLocaleDateString()}</Text>
        )}
      </Box>

      {/* Connection URLs */}
      <Box flexDirection="column" marginTop={1}>
        <Box gap={1}>
          <Text dimColor>{"Studio  "}</Text>
          <Text color="green">{studioUrl}</Text>
          <Text dimColor>  [u]</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"API     "}</Text>
          <Text>{apiUrl}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"Postgres"}</Text>
          <Text dimColor>{pgConn}</Text>
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
          </>
        }
      </Box>

    </Box>
  );
}

// ── Section 1 — Core Supabase ──────────────────────────────────────────────────

const CORE_KEY_HINTS = [
  { k: "↑↓", label: "services" },
  { k: "↵", label: "logs" },
  { k: "2", label: "→ instances" },
];

interface CoreSectionProps {
  onLogs: (container: string) => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onHeal: () => void;
  onBackup: () => void;
  onVerify: () => void;
  onCopy: (text: string) => void;
  onOpenGallery: () => void;
  onNewInstance: () => void;
  hostSnapshot: HostSnapshot;
}

function CoreSection({
  onLogs, onStart, onStop, onRestart, onHeal, onBackup, onVerify,
  onCopy, onOpenGallery, onNewInstance, hostSnapshot,
}: CoreSectionProps) {
  const [didCopy, setDidCopy] = useState(false);

  const doCopy = useCallback((text: string) => {
    onCopy(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [onCopy]);

  const handleSelect = useCallback((opt: SelectOption) => {
    onLogs(opt.id);
  }, [onLogs]);

  useInput((input) => {
    if (input === "u") { void openBrowser(STUDIO_PROJECT_URL); return; }
    if (input === "s") { onStart(); return; }
    if (input === "x") { onStop(); return; }
    if (input === "r") { onRestart(); return; }
    if (input === "h") { onHeal(); return; }
    if (input === "b") { onBackup(); return; }
    if (input === "v") { onVerify(); return; }
    if (input === "g") { onOpenGallery(); return; }
    if (input === "c") { doCopy(buildConnectionSheet()); return; }
    if (input === "m") { doCopy(buildMcpConfig()); return; }
    if (input === "n") { onNewInstance(); return; }
  });

  return (
    <Box flexDirection="column">

      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <Box paddingX={1} paddingBottom={1} gap={2} alignItems="center">
        <Text bold color="cyan">◈  Core Supabase</Text>
        <Text dimColor>primary control-plane DB</Text>
        <Text dimColor>·  zones attached  ·  MCP ready</Text>
      </Box>

      {/* ── Quick-access URLs ─────────────────────────────────────────────── */}
      <Box flexDirection="column" paddingX={1} paddingBottom={1}>
        <Box gap={1}>
          <Text dimColor>{"Studio  "}</Text>
          <Text color="green">{STUDIO_PROJECT_URL}</Text>
          <Text dimColor>  [u]</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"API     "}</Text>
          <Text>{KONG_URL}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"Postgres"}</Text>
          <Text dimColor>{postgresConnStr()}</Text>
        </Box>
      </Box>

      {/* ── Live metrics ──────────────────────────────────────────────────── */}
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

      {/* ── Action groups ─────────────────────────────────────────────────── */}
      <Box flexDirection="column" paddingX={1} paddingTop={1} paddingBottom={1} gap={0}>
        <ActionGroup label="Operate" hints={[
          { k: "s", label: "start" },
          { k: "x", label: "stop" },
          { k: "r", label: "restart" },
          { k: "h", label: "heal" },
          { k: "v", label: "verify" },
        ]} />
        <ActionGroup label="Protect" hints={[
          { k: "b", label: "backup" },
          { k: "g", label: "gallery" },
        ]} />
        <ActionGroup label="Connect" hints={[
          { k: "u", label: "Studio" },
          { k: "c", label: "copy conn. sheet" },
          { k: "m", label: "copy MCP config" },
        ]} />
        <ActionGroup label="Branch" hints={[
          { k: "n", label: "new runtime instance" },
          { k: "2", label: "→ Runtime Instances" },
        ]} />
      </Box>

      <Divider title="Core Services" />

      {/* ── Services — compact, selectable for logs ───────────────────────── */}
      <Box paddingX={1} paddingBottom={0}>
        <SelectMenu
          options={CORE_OPTIONS}
          onSelect={handleSelect}
          searchable={false}
        />
      </Box>

      <Divider />

      {/* ── API keys ──────────────────────────────────────────────────────── */}
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

      <KeyHints hints={CORE_KEY_HINTS} />

    </Box>
  );
}

// ── Section 2 — Runtime Instances ─────────────────────────────────────────────

const INSTANCE_KEY_HINTS = [
  { k: "↑↓", label: "navigate" },
  { k: "u", label: "open Studio" },
  { k: "r", label: "restart" },
  { k: "x", label: "stop" },
  { k: "d", label: "delete" },
  { k: "s", label: "snapshot" },
  { k: "g", label: "gallery" },
  { k: "v", label: "verify" },
  { k: "c", label: "copy conn." },
  { k: "m", label: "copy MCP" },
  { k: "n", label: "new instance" },
  { k: "1", label: "→ Core" },
];

interface InstancesSectionProps {
  instances: RuntimeInstance[];
  onInstanceAction: DbPanelProps["onInstanceAction"];
  onNewInstance: () => void;
  onOpenGallery: (inst: RuntimeInstance) => void;
  onCopy: (text: string) => void;
  onRefresh: () => void;
}

function InstancesSection({
  instances, onInstanceAction, onNewInstance, onOpenGallery, onCopy, onRefresh,
}: InstancesSectionProps) {
  const [highlighted, setHighlighted] = useState<RuntimeInstance | null>(
    instances[0] ?? null,
  );
  const [didCopy, setDidCopy] = useState(false);

  useEffect(() => {
    if (!highlighted && instances.length > 0) setHighlighted(instances[0]);
  }, [instances, highlighted]);

  const doCopy = useCallback((text: string) => {
    onCopy(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [onCopy]);

  // Build instance list options — show mode inferred from name/slug heuristic
  const instanceOptions: SelectOption[] = instances.map((inst) => {
    const age = inst.createdAt
      ? new Date(inst.createdAt).toLocaleDateString()
      : "—";
    return {
      id: inst.id,
      label: inst.name,
      desc: `${statusDot(inst.status)} ${inst.status.padEnd(8)}  ports Kong:${inst.ports.kong} Studio:${inst.ports.studio}  created ${age}`,
    };
  });

  const handleHighlight = useCallback((opt: SelectOption) => {
    setHighlighted(instances.find((i) => i.id === opt.id) ?? null);
  }, [instances]);

  useInput((input) => {
    if (!highlighted) {
      if (input === "n") onNewInstance();
      return;
    }
    if (input === "u") {
      void openBrowser(instanceStudioUrl(highlighted.ports.studio));
      return;
    }
    if (input === "c") {
      doCopy(buildConnectionSheet({
        label: highlighted.name,
        kongUrl: `http://localhost:${highlighted.ports.kong}`,
        studioUrl: instanceStudioUrl(highlighted.ports.studio),
        studioMcpUrl: instanceStudioMcpUrl(highlighted.ports.studio),
        anonKey: highlighted.secrets.anonKey,
        svcKey: highlighted.secrets.serviceRoleKey,
        pgConn: postgresConnStr(highlighted.secrets.postgresPassword),
      }));
      return;
    }
    if (input === "m") {
      doCopy(buildMcpConfig({
        kongUrl: `http://localhost:${highlighted.ports.kong}`,
        svcKey: highlighted.secrets.serviceRoleKey,
        pgConn: postgresConnStr(highlighted.secrets.postgresPassword),
      }));
      return;
    }
    if (input === "r") { onInstanceAction("restart", highlighted); return; }
    if (input === "x") { onInstanceAction("stop", highlighted); return; }
    if (input === "d") { onInstanceAction("delete", highlighted); return; }
    if (input === "s") { onInstanceAction("snapshot", highlighted); return; }
    if (input === "v") { onInstanceAction("verify", highlighted); return; }
    if (input === "g") { onOpenGallery(highlighted); return; }
    if (input === "n") { onNewInstance(); return; }
    if (input === "f") { onRefresh(); return; }
  });

  return (
    <Box flexDirection="column">

      {/* ── Section identity ────────────────────────────────────────────────── */}
      <Box paddingX={1} paddingBottom={1} gap={2} alignItems="center">
        <Text bold color="magenta">⬡  Runtime Instances</Text>
        <Text dimColor>branches · labs · side-project runtimes</Text>
      </Box>

      {instances.length === 0 ? (

        /* ── Empty state ────────────────────────────────────────────────────── */
        <Box flexDirection="column" paddingX={2} gap={1}>
          <Text dimColor>No runtime instances yet.</Text>
          <Text dimColor>Create one from Core Supabase with [n] → New Instance.</Text>
          <Box flexDirection="column" paddingTop={1} gap={0}>
            <Text dimColor bold>Available templates:</Text>
            <Text dimColor>  [1] Clone Core Supabase   — copy schema + data for staging/testing</Text>
            <Text dimColor>  [2] Blank Standalone       — fresh runtime for a side project</Text>
            <Text dimColor>  [3] Clone Existing Runtime — branch a test/staging DB forward</Text>
            <Text dimColor>  [4] Fresh + SQL Seed       — blank runtime with migrations/fixtures</Text>
          </Box>
          <Box paddingTop={1}>
            <Text color="magenta">[n] new instance</Text>
            <Text dimColor>  ·  </Text>
            <Text dimColor>[1] → Core Supabase</Text>
          </Box>
        </Box>

      ) : (
        <>
          {/* ── Instance list ───────────────────────────────────────────────── */}
          <Box paddingX={1}>
            <SelectMenu
              options={instanceOptions}
              onSelect={(opt) =>
                onInstanceAction("verify", instances.find((i) => i.id === opt.id)!)
              }
              onHighlight={handleHighlight}
              searchable={false}
            />
          </Box>

          <Divider />

          {/* ── Selected instance detail ─────────────────────────────────────── */}
          {highlighted && (
            <InstanceDetail inst={highlighted} didCopy={didCopy} />
          )}

          {/* ── Instance action groups ───────────────────────────────────────── */}
          <Box flexDirection="column" paddingX={1} paddingTop={1} paddingBottom={1} gap={0}>
            <ActionGroup label="Operate" hints={[
              { k: "r", label: "restart" },
              { k: "x", label: "stop" },
              { k: "v", label: "verify" },
              { k: "d", label: "delete" },
            ]} />
            <ActionGroup label="Protect" hints={[
              { k: "s", label: "snapshot" },
              { k: "g", label: "gallery" },
            ]} />
            <ActionGroup label="Connect" hints={[
              { k: "u", label: "open Studio" },
              { k: "c", label: "copy conn. sheet" },
              { k: "m", label: "copy MCP config" },
            ]} />
            <ActionGroup label="New" hints={[
              { k: "n", label: "new runtime instance" },
            ]} />
          </Box>
        </>
      )}

      <KeyHints hints={INSTANCE_KEY_HINTS} />

    </Box>
  );
}

// ── DbPanel — main ────────────────────────────────────────────────────────────

export function DbPanel({
  onLogs, onBackup, onCopy, onStart, onStop, onRestart, onHeal, onVerify,
  onNewInstance, onRestore, onInstanceAction, onGoBack, onSubCrumbs,
}: DbPanelProps) {

  const [section, setSection] = useState<"core" | "instances">("core");
  const [instances, setInstances] = useState<RuntimeInstance[]>([]);
  const [galleryInstance, setGalleryInstance] = useState<RuntimeInstance | null>(null);

  const hostSnapshot = useHostMonitor();

  useEffect(() => {
    if (section !== "instances") return;
    let cancelled = false;
    loadRegistry().then((list) => { if (!cancelled) setInstances(list); });
    return () => { cancelled = true; };
  }, [section]);

  const refreshInstances = useCallback(() => {
    loadRegistry().then(setInstances);
  }, []);

  // ── Breadcrumb sync ────────────────────────────────────────────────────────
  useEffect(() => {
    if (galleryInstance) {
      if (galleryInstance.id === "core") {
        onSubCrumbs(["gallery"]);
      } else {
        onSubCrumbs(["instances", `${galleryInstance.name} · gallery`]);
      }
    } else if (section === "instances") {
      onSubCrumbs(["instances"]);
    } else {
      onSubCrumbs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryInstance, section]);

  // Section switch + back nav (gallery owns its own keyboard)
  useInput((input, key) => {
    if (galleryInstance !== null) return;
    if (input === "1") { setSection("core"); return; }
    if (input === "2") { setSection("instances"); return; }
    if (input === "q" || key.leftArrow) { onGoBack(); return; }
  });

  // ── Gallery overlay ────────────────────────────────────────────────────────
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

  // ── Normal layout ──────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column">

      <Tabs
        tabs={["Core Supabase", "Runtime Instances"]}
        active={section === "core" ? "Core Supabase" : "Runtime Instances"}
        marginBottom={1}
      />

      {section === "core" ? (
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
      ) : (
        <InstancesSection
          instances={instances}
          onInstanceAction={onInstanceAction}
          onNewInstance={onNewInstance}
          onOpenGallery={setGalleryInstance}
          onCopy={onCopy}
          onRefresh={refreshInstances}
        />
      )}

    </Box>
  );
}
