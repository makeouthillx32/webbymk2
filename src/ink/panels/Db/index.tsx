// src/ink/panels/Db/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Database panel — Dual-Layer Infrastructure Dashboard + Connection Hub.
//
// Architecture: One database · Many zones · Portable core runtime
//
// ┌─ [Tab] section switch ────────────────────────────────────────────────────┐
// │  core runtime                      instances                              │
// ├───────────────────────────────────────────────────────────────────────────┤
// │  Section 1 — Core Runtime                                                 │
// │    • Service list (unt_* containers)                                      │
// │    • Connection Hub — always-visible Studio URL, API, PG conn, keys       │
// │    [s] Start  [x] Stop  [r] Restart  [h] Heal  [b] Backup  [v] Verify    │
// │    [g] Gallery  [u] Open Studio  [c] Copy connection sheet  [m] Copy MCP  │
// │                                                                           │
// │  Section 2 — Runtime Instances                                            │
// │    • Instance list from JSON registry                                     │
// │    • Per-instance connection detail on highlight                          │
// │    [r] Restart  [x] Stop  [d] Delete  [s] Snapshot  [g] Gallery          │
// │    [v] Verify  [n] New  [u] Open Studio  [c] Copy conn  [m] Copy MCP     │
// └───────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput }                      from "ink";
import { openBrowser }                              from "@/utils/browser.ts";
import {
  KONG_URL, STUDIO_PROJECT_URL, ANON_KEY, SERVICE_KEY,
  postgresConnStr, instanceStudioUrl, instanceStudioMcpUrl,
  buildConnectionSheet, buildMcpConfig,
}                                                   from "../../db-api.ts";
import { loadRegistry }                             from "../../zone/supabase-factory.ts";
import type { RuntimeInstance, HealthState }        from "../../zone/supabase-factory.ts";
import { PROJECT_DIR }                              from "../../../config/stack.ts";
import type { SnapshotBundle }                      from "../../zone/snapshot.ts";
import { KeyHints }                                 from "../../components/KeyHint.tsx";
import { Pane }                                     from "../../components/Pane.tsx";
import { Tabs }                                     from "../../components/Tabs.tsx";
import { Divider }                                  from "../../components/Divider.tsx";
import { SelectMenu, type SelectOption }            from "../../components/SelectMenu.tsx";
import { SnapshotGalleryScreen }                    from "../../screens/SnapshotGalleryScreen.tsx";
import { useHostMonitor }                           from "../../hooks/useHostMonitor.ts";
import { sparkline }                                from "../../utils/sparkline.ts";
import { MetricCard }                               from "../../components/design-system/MetricCard.tsx";
import { SectionFrame }                             from "../../components/design-system/SectionFrame.tsx";
import { ProgressLine }                             from "../../components/design-system/ProgressLine.tsx";


// ── Core runtime service manifest ─────────────────────────────────────────────

const CORE_SERVICES = [
  { label: "Postgres",  container: "unt_db",       desc: "primary database (pg 15)"  },
  { label: "Kong",      container: "unt_kong",      desc: "API gateway :8001"         },
  { label: "Auth",      container: "unt_auth",      desc: "GoTrue authentication"     },
  { label: "PostgREST", container: "unt_rest",      desc: "auto REST API"             },
  { label: "Storage",   container: "unt_storage",   desc: "object / file storage"     },
  { label: "Realtime",  container: "unt_realtime",  desc: "WebSocket broadcast"       },
  { label: "Studio",    container: "unt_studio",    desc: "dashboard UI  :3002"       },
  { label: "Meta",      container: "unt_meta",      desc: "postgres-meta"             },
  { label: "Imgproxy",  container: "unt_imgproxy",  desc: "image processing"          },
] as const;

const CORE_OPTIONS: SelectOption[] = CORE_SERVICES.map((s) => ({
  id:    s.container,
  label: s.label,
  desc:  `${s.container}  ·  ${s.desc}`,
}));

// ── Virtual RuntimeInstance for the core stack ─────────────────────────────────
//
// The core stack (unt_db, unt_kong, etc.) runs from the root docker-compose.yml
// and isn't registered in instances.json.  We define a virtual RuntimeInstance
// so the SnapshotGalleryScreen can find core snapshots at
//   backups/supabase-core/core/

const CORE_INSTANCE: RuntimeInstance = {
  id:            "core",
  name:          "Core Runtime",
  slug:          "core",
  status:        "active",
  createdAt:     "",
  runtimePath:   PROJECT_DIR,
  dockerPath:    PROJECT_DIR,
  ports: {
    kong:      8001,
    kongSSL:   8443,
    postgres:  5432,
    pooler:    0,
    analytics: 0,
    studio:    3002,
  },
  secrets: {
    postgresPassword:  "",
    jwtSecret:         "",
    anonKey:           ANON_KEY,
    serviceRoleKey:    SERVICE_KEY,
    dashboardPassword: "",
  },
  studioUrl:     STUDIO_PROJECT_URL,
  healthState:   "unknown",
  snapshotState: "none",
};

// ── Prop types ────────────────────────────────────────────────────────────────

export interface DbPanelProps {
  onLogs:           (container: string) => void;
  onBackup:         () => void;
  onCopy:           (text: string) => void;
  onStart:          () => void;
  onStop:           () => void;
  onRestart:        () => void;
  onHeal:           () => void;
  onVerify:         () => void;
  onNewInstance:    () => void;
  onRestore:        (bundle: SnapshotBundle, instance: RuntimeInstance) => void;
  onInstanceAction: (
    action:   "restart" | "stop" | "delete" | "snapshot" | "verify",
    instance: RuntimeInstance,
  ) => void;
  onGoBack:         () => void;
}

// ── Key truncation helper ─────────────────────────────────────────────────────

function truncKey(key: string, n = 38): string {
  if (!key) return "(not set)";
  return key.length > n ? key.slice(0, n) + "…" : key;
}

// ── Health / status colors ────────────────────────────────────────────────────

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

// ── ConnectionHub — always-visible connection info pane ───────────────────────
//
// Shown below the service list in the Core section (and per-instance in Instances).
// Displays the key endpoints and a truncated preview of API keys so you always
// know what's running without having to copy anything first.

interface ConnectionHubProps {
  label:      string;
  studioUrl:  string;
  apiUrl:     string;
  pgConn:     string;
  anonKey:    string;
  svcKey:     string;
  didCopy?:   boolean;
}

function ConnectionHub({
  label, studioUrl, apiUrl, pgConn, anonKey, svcKey, didCopy,
}: ConnectionHubProps) {
  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>

      <Box gap={1} marginBottom={0}>
        <Text bold color="cyan">── {label} ─</Text>
      </Box>

      {/* URLs */}
      <Box flexDirection="column" paddingLeft={1} marginTop={0}>
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
          <Text dimColor>{"REST    "}</Text>
          <Text dimColor>{apiUrl}/rest/v1/</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"Postgres"}</Text>
          <Text>{pgConn}</Text>
        </Box>
      </Box>

      {/* Keys */}
      <Box flexDirection="column" paddingLeft={1} marginTop={1}>
        <Box gap={1}>
          <Text dimColor>{"anon     "}</Text>
          <Text color="yellow">{truncKey(anonKey)}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"svc_role "}</Text>
          <Text color="yellow">{truncKey(svcKey)}</Text>
        </Box>
      </Box>

      {/* Copy hint */}
      <Box paddingLeft={1} marginTop={1} gap={2}>
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

// ── Section 1 — Core Runtime ──────────────────────────────────────────────────

const CORE_HINTS = [
  { k: "↑↓",  label: "navigate"    },
  { k: "↵",   label: "logs"        },
  { k: "u",   label: "open Studio" },
  { k: "s",   label: "start"       },
  { k: "x",   label: "stop"        },
  { k: "r",   label: "restart"     },
  { k: "h",   label: "heal"        },
  { k: "b",   label: "backup"      },
  { k: "v",   label: "verify"      },
  { k: "g",   label: "gallery"     },
  { k: "c",   label: "copy conn."  },
  { k: "m",   label: "copy MCP"    },
  { k: "Tab", label: "→ instances" },
];

import { HostSnapshot } from "../../hooks/useHostMonitor.ts";

interface CoreSectionProps {
  onLogs:       (container: string) => void;
  onStart:      () => void;
  onStop:       () => void;
  onRestart:    () => void;
  onHeal:       () => void;
  onBackup:     () => void;
  onVerify:     () => void;
  onCopy:       (text: string) => void;
  onOpenGallery: () => void;
  hostSnapshot: HostSnapshot;
}

function CoreSection({
  onLogs, onStart, onStop, onRestart, onHeal, onBackup, onVerify, onCopy, onOpenGallery, hostSnapshot,
}: CoreSectionProps) {
  const [didCopy, setDidCopy] = useState(false);

  const doCopy = useCallback((text: string) => {
    onCopy(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [onCopy]);

  const handleSelect = useCallback((opt: SelectOption) => { onLogs(opt.id); }, [onLogs]);

  useInput((input) => {
    if (input === "u") { void openBrowser(STUDIO_PROJECT_URL);                     return; }
    if (input === "s") { onStart();                                              return; }
    if (input === "x") { onStop();                                               return; }
    if (input === "r") { onRestart();                                            return; }
    if (input === "h") { onHeal();                                               return; }
    if (input === "b") { onBackup();                                             return; }
    if (input === "v") { onVerify();                                             return; }
    if (input === "g") { onOpenGallery();                                        return; }
    if (input === "c") { doCopy(buildConnectionSheet());                         return; }
    if (input === "m") { doCopy(buildMcpConfig());                               return; }
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <Box flexDirection="column">
      <Pane title={`Core Runtime  ·  ${STUDIO_PROJECT_URL}`} color="cyan" gap={1}>
        
        {/* Live Performance Row */}
        <Box gap={1} marginBottom={1}>
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

        <SectionFrame title="Core Services" tone="suggestion">
          <SelectMenu
            options={CORE_OPTIONS}
            onSelect={handleSelect}
            searchable={false}
          />
        </SectionFrame>

        <ConnectionHub
          label="Connection Info"
          studioUrl={STUDIO_PROJECT_URL}
          apiUrl={KONG_URL}
          pgConn={postgresConnStr()}
          anonKey={ANON_KEY}
          svcKey={SERVICE_KEY}
          didCopy={didCopy}
        />

      </Pane>
      <KeyHints hints={CORE_HINTS} />
    </Box>
  );
}

// ── Section 2 — Runtime Instances ─────────────────────────────────────────────────

const INSTANCE_HINTS = [
  { k: "↑↓",  label: "navigate"     },
  { k: "u",   label: "open Studio"  },
  { k: "r",   label: "restart"      },
  { k: "x",   label: "stop"         },
  { k: "d",   label: "delete"       },
  { k: "s",   label: "snapshot"     },
  { k: "g",   label: "gallery"      },
  { k: "v",   label: "verify"       },
  { k: "c",   label: "copy conn."   },
  { k: "m",   label: "copy MCP"     },
  { k: "n",   label: "new instance" },
  { k: "Tab", label: "→ core"       },
];

interface InstancesSectionProps {
  instances:        RuntimeInstance[];
  onInstanceAction: DbPanelProps["onInstanceAction"];
  onNewInstance:    () => void;
  onOpenGallery:    (inst: RuntimeInstance) => void;
  onCopy:           (text: string) => void;
  onRefresh:        () => void;
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

  const instanceOptions: SelectOption[] = instances.map((inst) => ({
    id:    inst.id,
    label: inst.name,
    desc:  `${inst.slug}  ·  Kong:${inst.ports.kong}  Studio:${inst.ports.studio}  [${inst.status}]`,
  }));

  const handleHighlight = useCallback((opt: SelectOption) => {
    setHighlighted(instances.find((i) => i.id === opt.id) ?? null);
  }, [instances]);

  useInput((input) => {
    if (!highlighted) { if (input === "n") { onNewInstance(); } return; }

    if (input === "u") {
      void openBrowser(instanceStudioUrl(highlighted.ports.studio));
      return;
    }
    if (input === "c") {
      doCopy(buildConnectionSheet({
        label:     highlighted.name,
        kongUrl:   `http://localhost:${highlighted.ports.kong}`,
        studioUrl: instanceStudioUrl(highlighted.ports.studio),
        studioMcpUrl: instanceStudioMcpUrl(highlighted.ports.studio),
        anonKey:   highlighted.secrets.anonKey,
        svcKey:    highlighted.secrets.serviceRoleKey,
        pgConn:    postgresConnStr(highlighted.secrets.postgresPassword),
      }));
      return;
    }
    if (input === "m") {
      doCopy(buildMcpConfig({
        kongUrl: `http://localhost:${highlighted.ports.kong}`,
        svcKey:  highlighted.secrets.serviceRoleKey,
        pgConn:  postgresConnStr(highlighted.secrets.postgresPassword),
      }));
      return;
    }
    if (input === "r") { onInstanceAction("restart",  highlighted); return; }
    if (input === "x") { onInstanceAction("stop",     highlighted); return; }
    if (input === "d") { onInstanceAction("delete",   highlighted); return; }
    if (input === "s") { onInstanceAction("snapshot", highlighted); return; }
    if (input === "v") { onInstanceAction("verify",   highlighted); return; }
    if (input === "g") { onOpenGallery(highlighted);                return; }
    if (input === "n") { onNewInstance();                           return; }
    if (input === "f") { onRefresh();                               return; }
  });

  return (
    <Box flexDirection="column">
      <Pane
        title={`Instances  ·  ${instances.length} database${instances.length !== 1 ? "s" : ""}`}
        color="magenta"
        gap={1}
      >

        {instances.length === 0 ? (
          <Box paddingX={1} flexDirection="column" gap={1}>
            <Text dimColor>No instances yet.</Text>
            <Text dimColor>Press [n] to scaffold a new database instance.</Text>
          </Box>
        ) : (
          <SelectMenu
            options={instanceOptions}
            onSelect={(opt) => onInstanceAction("verify", instances.find((i) => i.id === opt.id)!)}
            onHighlight={handleHighlight}
            searchable={false}
          />
        )}

        {/* ── Per-instance connection hub ──────────────────────────────────── */}
        {highlighted && (
          <>
            {/* Status bar */}
            <Box paddingX={1} marginTop={1} gap={3}>
              <Text bold>{highlighted.name}</Text>
              <Text color={statusColor(highlighted.status)}>{highlighted.status}</Text>
              <Text color={healthColor(highlighted.healthState)}>{highlighted.healthState}</Text>
              {highlighted.lastSnapshot && (
                <Text dimColor>snap {new Date(highlighted.lastSnapshot).toLocaleDateString()}</Text>
              )}
            </Box>

            <ConnectionHub
              label={`${highlighted.slug} · connection`}
              studioUrl={instanceStudioUrl(highlighted.ports.studio)}
              apiUrl={`http://localhost:${highlighted.ports.kong}`}
              pgConn={postgresConnStr(highlighted.secrets.postgresPassword)}
              anonKey={highlighted.secrets.anonKey}
              svcKey={highlighted.secrets.serviceRoleKey}
              didCopy={didCopy}
            />
          </>
        )}

      </Pane>
      <KeyHints hints={INSTANCE_HINTS} />
    </Box>
  );
}

// ── DbPanel — main ────────────────────────────────────────────────────────────

export function DbPanel({
  onLogs, onBackup, onCopy, onStart, onStop, onRestart, onHeal, onVerify,
  onNewInstance, onRestore, onInstanceAction, onGoBack,
}: DbPanelProps) {

  const [section,         setSection]         = useState<"core" | "instances">("core");
  const [instances,       setInstances]       = useState<RuntimeInstance[]>([]);
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

  // Tab / q / ← only active when gallery is NOT open (gallery handles its own Esc/q)
  useInput((input, key) => {
    if (galleryInstance !== null) return; // gallery owns the keyboard
    if (key.tab)                        { setSection((s) => s === "core" ? "instances" : "core"); return; }
    if (input === "q" || key.leftArrow) { onGoBack(); return; }
  });

  // ── Gallery overlay takes over the whole panel ────────────────────────────
  if (galleryInstance !== null) {
    return (
      <SnapshotGalleryScreen
        instance={galleryInstance}
        onRestore={(bundle) => {
          setGalleryInstance(null);               // close gallery
          onRestore(bundle, galleryInstance);     // fire background restore op
        }}
        onBack={() => setGalleryInstance(null)}
      />
    );
  }

  // ── Normal panel layout ───────────────────────────────────────────────────
  return (
    <Box flexDirection="column">

      <Tabs
        tabs={["core runtime", "instances"]}
        active={section === "core" ? "core runtime" : "instances"}
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
