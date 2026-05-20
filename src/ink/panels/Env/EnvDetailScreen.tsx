// src/ink/panels/Env/EnvDetailScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Environment detail screen — Portainer-style per-node management view.
//
// Tabs:
//   Overview      — Docker stats grid (Portainer-style large cards).
//                   Cards are individually focusable; [Enter] opens each one.
//   Configuration — Core env fields (name, URLs, domain, role).
//   Config        — UNAXIS-specific settings (NPM, proxy, agent, vault).
//
// Overview card sub-views:
//   Stacks · Containers · Images · Volumes · Networks
//
// Navigation:
//   [Tab / h / l]  cycle top-level tabs
//   [↑↓ / j / k]  move card focus (Overview tab only)
//   [Enter]        open focused card
//   [r]            refresh stats
//   [q / ←]        back (or close sub-view → back to overview)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput }                     from "ink";

import { fetchDashboard }              from "../../agent-client.ts";
import type { DashboardResponse }      from "../../agent-client.ts";
import { Spinner }                     from "../../components/Spinner.tsx";
import { Divider }                     from "../../components/Divider.tsx";
import { KeyHints }                    from "../../components/KeyHint.tsx";
import type { UnaxisEnvironment }      from "../../environment-store.ts";
import { ContainersView }              from "./views/ContainersView.tsx";
import { StacksView }                  from "./views/StacksView.tsx";
import { ImagesView }                  from "./views/ImagesView.tsx";
import { VolumesView }                 from "./views/VolumesView.tsx";
import { NetworksView }                from "./views/NetworksView.tsx";

// ── Types ─────────────────────────────────────────────────────────────────────

type DetailTab    = "overview" | "configuration" | "config";
type OverviewCard = "stacks" | "containers" | "images" | "volumes" | "networks";

const OVERVIEW_CARDS: OverviewCard[] = [
  "stacks", "containers", "images", "volumes", "networks",
];

// DockerStats is now sourced from the agent's /docker/dashboard endpoint.
// Shape mirrors DashboardResponse from agent-client.ts / dashboard.go.
type DockerStats = DashboardResponse;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes <= 0)    return "—";
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3)  return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}
function fmtRam(bytes: number): string {
  if (bytes <= 0) return "—";
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB RAM`;
}

// ── Stat card — large focusable Portainer-style tile ──────────────────────────

function StatCard({
  label, value, note, right, focused, onSelect,
}: {
  label:    string;
  value:    string;
  note?:    string;
  right?:   React.ReactNode;
  focused:  boolean;
  onSelect: () => void;
}) {
  return (
    <Box
      flexGrow={1}
      flexDirection="row"
      borderStyle="round"
      borderColor={focused ? "cyan" : "gray"}
      paddingX={2}
      paddingY={1}
      justifyContent="space-between"
    >
      {/* Left: indicator + big number + label */}
      <Box flexDirection="column" gap={0}>
        <Box gap={1} alignItems="flex-end">
          {focused && <Text color="cyan">▶</Text>}
          <Text bold color={focused ? "cyan" : "white"}>{value}</Text>
          {note && <Text color="cyan" dimColor>{note}</Text>}
        </Box>
        <Text dimColor paddingLeft={focused ? 2 : 0}>{label}</Text>
      </Box>

      {/* Right: sub-stats */}
      {right && (
        <Box flexDirection="column" alignItems="flex-end">
          {right}
        </Box>
      )}
    </Box>
  );
}

// ── Resource shim screens ─────────────────────────────────────────────────────

const SHIM_INFO: Record<OverviewCard, { title: string; description: string }> = {
  stacks:     { title: "Stacks",     description: "Compose stacks running on this environment." },
  containers: { title: "Containers", description: "All containers — running, stopped, and paused." },
  images:     { title: "Images",     description: "Docker images available on this node." },
  volumes:    { title: "Volumes",    description: "Named and anonymous volumes on this node." },
  networks:   { title: "Networks",   description: "Docker networks (bridge, host, overlay, etc.)." },
};

function ResourceShim({
  card, env, stats,
}: {
  card:  OverviewCard;
  env:   UnaxisEnvironment;
  stats: DockerStats | null;
}) {
  const info  = SHIM_INFO[card];
  const count = stats
    ? card === "stacks"     ? stats.stacks
    : card === "containers" ? stats.containers.total
    : card === "images"     ? stats.images.total
    : card === "volumes"    ? stats.volumes
    :                         stats.networks
    : null;

  return (
    <Box flexDirection="column" flexGrow={1} gap={1} paddingX={2} paddingY={1}>

      {/* Header */}
      <Box gap={2} alignItems="center">
        <Text bold color="cyan">{info.title}</Text>
        {count !== null && (
          <Box borderStyle="round" borderColor="gray" paddingX={1}>
            <Text color="white" bold>{count}</Text>
          </Box>
        )}
        <Text dimColor>on {env.name}</Text>
      </Box>

      <Divider />

      {/* Shim body */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
        gap={1}
      >
        <Text dimColor>{info.description}</Text>
        <Text dimColor>
          Full {info.title.toLowerCase()} management is coming soon — pending
          Portainer analysis.
        </Text>
      </Box>

      <Box paddingX={1}>
        <Text dimColor>
          Press <Text color="cyan">[q]</Text> or{" "}
          <Text color="cyan">[←]</Text> to go back.
        </Text>
      </Box>

    </Box>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box gap={2}>
      <Box minWidth={14}><Text dimColor>{label}</Text></Box>
      {children}
    </Box>
  );
}

const typeLabel: Record<string, string> = {
  "local-docker":  "Standalone",
  "remote-docker": "Agent",
  "azure":         "Azure",
  "edge":          "Edge",
};

function OverviewTab({ env, stats, loading, error, focusedCard, onOpenCard }: {
  env:          UnaxisEnvironment;
  stats:        DockerStats | null;
  loading:      boolean;
  error:        string | null;
  focusedCard:  number;
  onOpenCard:   (card: OverviewCard) => void;
}) {
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>

      {/* ── Environment info box ────────────────────────────────────── */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={0}
      >
        <Text bold color="cyan">Environment info</Text>

        <InfoRow label="Environment">
          <Box gap={2}>
            <Text bold color="white">{env.name}</Text>
            {stats && stats.info.cpu > 0      && <Text dimColor>⊞ {stats.info.cpu}</Text>}
            {stats && stats.info.memory > 0   && <Text dimColor>⊟ {fmtRam(stats.info.memory)}</Text>}
            <Text dimColor>–</Text>
            <Text dimColor>{typeLabel[env.type] ?? env.type}</Text>
            {env.agentVersion && <Text dimColor>{env.agentVersion}</Text>}
          </Box>
        </InfoRow>

        <InfoRow label="URL">
          <Text color="white">{env.agentUrl || env.dockerUrl || "—"}</Text>
        </InfoRow>

        {env.domain && (
          <InfoRow label="Domain">
            <Text color="white">{env.domain}</Text>
          </InfoRow>
        )}

        <InfoRow label="Tags">
          <Text dimColor>{env.tags?.join(", ") || "—"}</Text>
        </InfoRow>
      </Box>

      {/* ── Status / spinner ────────────────────────────────────────── */}
      {loading && (
        <Box gap={1} paddingX={1}>
          <Spinner />
          <Text color="yellow">Fetching Docker stats…</Text>
        </Box>
      )}
      {error && !loading && (
        <Box paddingX={1} flexDirection="column">
          <Text color="red">{error}</Text>
          <Text dimColor>Press [r] to retry.</Text>
        </Box>
      )}

      {/* ── Stat cards grid ─────────────────────────────────────────── */}
      {stats && !loading && (
        <Box flexDirection="column" gap={1}>

          {/* Row 1: Stacks | Containers */}
          <Box flexDirection="row" gap={1}>
            <StatCard
              label="Stacks"
              value={String(stats.stacks)}
              focused={focusedCard === 0}
              onSelect={() => onOpenCard("stacks")}
            />
            <StatCard
              label="Containers"
              value={String(stats.containers.total)}
              focused={focusedCard === 1}
              onSelect={() => onOpenCard("containers")}
              right={
                <>
                  <Text color="green">{stats.containers.running} running</Text>
                  <Text color="red">{stats.containers.stopped} stopped</Text>
                  <Text dimColor>{stats.containers.healthy} healthy</Text>
                  <Text color={stats.containers.unhealthy > 0 ? "red" : undefined} dimColor>
                    {stats.containers.unhealthy} unhealthy
                  </Text>
                </>
              }
            />
          </Box>

          {/* Row 2: Images | Volumes */}
          <Box flexDirection="row" gap={1}>
            <StatCard
              label="Images"
              value={String(stats.images.total)}
              note={fmtBytes(stats.images.size)}
              focused={focusedCard === 2}
              onSelect={() => onOpenCard("images")}
            />
            <StatCard
              label="Volumes"
              value={String(stats.volumes)}
              focused={focusedCard === 3}
              onSelect={() => onOpenCard("volumes")}
            />
          </Box>

          {/* Row 3: Networks (half-width) */}
          <Box flexDirection="row" gap={1}>
            <StatCard
              label="Networks"
              value={String(stats.networks)}
              focused={focusedCard === 4}
              onSelect={() => onOpenCard("networks")}
            />
            <Box flexGrow={1} />
          </Box>

        </Box>
      )}
    </Box>
  );
}

// ── Configuration tab ─────────────────────────────────────────────────────────

function Field({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  if (!value) return null;
  return (
    <Box gap={2}>
      <Box minWidth={18}><Text dimColor>{label}</Text></Box>
      <Text color={dim ? undefined : "white"} dimColor={dim}>{value}</Text>
    </Box>
  );
}

const fullTypeLabel: Record<string, string> = {
  "local-docker":  "Local Docker (socket)",
  "remote-docker": "Remote Docker (agent)",
  "azure":         "Azure",
  "edge":          "Edge",
};

function ConfigurationTab({ env }: { env: UnaxisEnvironment }) {
  return (
    <Box flexDirection="column" gap={0} paddingX={2} paddingY={1}>
      <Field label="Name"           value={env.name} />
      <Field label="Type"           value={fullTypeLabel[env.type] ?? env.type} />
      <Field label="Agent URL"      value={env.agentUrl    ?? "—"} />
      <Field label="Docker URL"     value={env.dockerUrl   ?? "—"} />
      <Field label="Public URL"     value={env.publicUrl   ?? "—"} />
      <Field label="Domain"         value={env.domain      ?? "—"} />
      <Field label="DDNS Hostname"  value={env.ddnsHostname ?? "—"} />
      <Field label="Machine Role"   value={env.machineRole ?? "—"} />
      <Field label="Default Target" value={env.isDefaultTarget ? "★ yes" : "no"} dim />
    </Box>
  );
}

// ── Config tab ────────────────────────────────────────────────────────────────

function ConfigTab({ env }: { env: UnaxisEnvironment }) {
  return (
    <Box flexDirection="column" gap={1} paddingX={2} paddingY={1}>

      <Box flexDirection="column" gap={0}>
        <Text bold color="cyan">Agent</Text>
        <Field label="Agent URL"     value={env.agentUrl    ?? "—"} />
        <Field label="Agent Port"    value={env.agentPort ? String(env.agentPort) : "—"} />
        <Field label="Agent Version" value={env.agentVersion ?? "—"} />
        <Field label="Agent Status"  value={env.agentStatus} />
        <Field label="Token Secret"  value={env.agentTokenSecretId ? "✓ configured" : "—"} dim />
      </Box>

      <Divider />

      {(env.npmHost || env.npmSecretId) && (
        <Box flexDirection="column" gap={0}>
          <Text bold color="cyan">Nginx Proxy Manager</Text>
          <Field label="Host"           value={env.npmHost ?? "—"} />
          <Field label="Port"           value={env.npmPort ? String(env.npmPort) : "—"} />
          <Field label="Admin Password" value={env.npmSecretId ? "✓ in vault" : "—"} dim />
        </Box>
      )}

      {env.proxyHost && (
        <>
          <Divider />
          <Box flexDirection="column" gap={0}>
            <Text bold color="cyan">Reverse Proxy</Text>
            <Field label="Host" value={env.proxyHost ?? "—"} />
            <Field label="Port" value={env.proxyPort ? String(env.proxyPort) : "—"} />
          </Box>
        </>
      )}

      {env.azureAppIdSecretId && (
        <>
          <Divider />
          <Box flexDirection="column" gap={0}>
            <Text bold color="cyan">Azure</Text>
            <Field label="App ID"    value={env.azureAppIdSecretId    ? "✓ in vault" : "—"} dim />
            <Field label="Tenant ID" value={env.azureTenantIdSecretId ? "✓ in vault" : "—"} dim />
            <Field label="Auth Key"  value={env.azureAuthKeySecretId  ? "✓ in vault" : "—"} dim />
          </Box>
        </>
      )}

      <Divider />
      <Box flexDirection="column" gap={0}>
        <Text bold color="cyan">Meta</Text>
        <Field label="Tags"       value={env.tags?.join(", ") || "—"} dim />
        <Field label="Sort Order" value={String(env.sortOrder ?? 0)} dim />
      </Box>

    </Box>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const TABS: DetailTab[] = ["overview", "configuration", "config"];

export interface EnvDetailScreenProps {
  env:    UnaxisEnvironment;
  onBack: () => void;
}

export function EnvDetailScreen({ env, onBack }: EnvDetailScreenProps) {
  const [tab,         setTab]         = useState<DetailTab>("overview");
  const [subView,     setSubView]     = useState<OverviewCard | null>(null);
  const [focusedCard, setFocusedCard] = useState(0);
  const [stats,       setStats]       = useState<DockerStats | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!env.agentUrl || env.agentStatus !== "online") {
      setError(
        env.agentUrl
          ? "Agent offline — go back and press [p] to reconnect"
          : "Agent not configured — go back and press [a] to add the agent",
      );
      return;
    }
    setLoading(true);
    setError(null);
    // Single aggregated request — mirrors GET /api/endpoints/{id}/docker/dashboard
    const result = await fetchDashboard(env);
    setLoading(false);
    if (result) setStats(result);
    else setError("Failed to fetch dashboard from agent — check connection");
  }, [env]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const cycleTab = useCallback((dir: 1 | -1) => {
    setTab((t) => {
      const i = TABS.indexOf(t);
      return TABS[(i + dir + TABS.length) % TABS.length]!;
    });
  }, []);

  // Card count visible is determined by whether stats loaded
  const cardCount = OVERVIEW_CARDS.length;

  useInput((input, key) => {
    // ── Inside a sub-view — only back ─────────────────────────────
    if (subView) {
      if (key.escape || input === "q" || key.leftArrow) {
        setSubView(null);
      }
      return;
    }

    // ── Top-level navigation ──────────────────────────────────────
    if (key.escape || input === "q" || key.leftArrow) { onBack(); return; }
    if (key.tab || input === "l") { cycleTab(1);  return; }
    if (input === "h")            { cycleTab(-1); return; }
    if (input === "r")            { loadStats();  return; }

    // ── Card navigation (overview tab only) ───────────────────────
    if (tab === "overview") {
      if (key.upArrow || input === "k") {
        setFocusedCard((f) => Math.max(0, f - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setFocusedCard((f) => Math.min(cardCount - 1, f + 1));
        return;
      }
      if (key.return && stats) {
        setSubView(OVERVIEW_CARDS[focusedCard] ?? null);
        return;
      }
    }
  });

  const agentDot = env.agentStatus === "online"
    ? { dot: "●", color: "green"  }
    : env.agentStatus === "offline"
    ? { dot: "●", color: "red"    }
    : { dot: "●", color: "gray"   };

  // ── Sub-view active ────────────────────────────────────────────────────────
  if (subView) {
    const hints = [{ k: "q/←", label: "back to overview" }];
    return (
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {/* Breadcrumb */}
        <Box paddingX={1} gap={1} marginBottom={0}>
          <Text dimColor>{env.name}</Text>
          <Text dimColor>›</Text>
          <Text bold color="cyan">{SHIM_INFO[subView].title}</Text>
        </Box>
        <Divider />
        <ResourceShim card={subView} env={env} stats={stats} />
        <KeyHints hints={hints} />
      </Box>
    );
  }

  // ── Determine hints based on tab ───────────────────────────────────────────
  const hints = tab === "overview" && stats
    ? [
        { k: "↑↓/jk", label: "focus card" },
        { k: "Enter",  label: "open" },
        { k: "Tab/h/l",label: "switch tab" },
        { k: "r",      label: "refresh" },
        { k: "q/←",   label: "back" },
      ]
    : [
        { k: "Tab/h/l", label: "switch tab" },
        { k: "r",       label: "refresh" },
        { k: "q/←",    label: "back" },
      ];

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <Box paddingX={1} gap={2} marginBottom={0}>
        <Text bold color="cyan">{env.name}</Text>
        <Text color={agentDot.color as any}>{agentDot.dot}</Text>
        {env.agentStatus === "online"  && <Text color="green">online</Text>}
        {env.agentStatus === "offline" && <Text color="red">offline</Text>}
        {env.agentStatus === "unknown" && <Text dimColor>unknown</Text>}
        {env.agentVersion && <Text dimColor>v{env.agentVersion}</Text>}
        {env.isDefaultTarget && <Text color="#D4A27F" bold>★ default</Text>}
      </Box>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <Box paddingX={1} gap={1}>
        {TABS.map((t) => (
          <Box
            key={t}
            paddingX={1}
            borderStyle={tab === t ? "round" : undefined}
            borderColor="cyan"
          >
            <Text bold={tab === t} color={tab === t ? "cyan" : undefined} dimColor={tab !== t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Box>
        ))}
      </Box>

      <Divider />

      {/* ── Tab content ─────────────────────────────────────────────── */}
      {tab === "overview" && (
        <OverviewTab
          env={env}
          stats={stats}
          loading={loading}
          error={error}
          focusedCard={focusedCard}
          onOpenCard={(card) => setSubView(card)}
        />
      )}
      {tab === "configuration" && <ConfigurationTab env={env} />}
      {tab === "config"        && <ConfigTab        env={env} />}

      <KeyHints hints={hints} />
    </Box>
  );
}
