// src/ink/components/RuntimeInstancesOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Global runtime-instances manager — accessible from the StartupScreen picker
// phase before entering any project.
//
// Sub-phases:
//   "list"         instance list + inline detail (InstancesSection)
//   "detail"       full-screen instance detail  (InstanceDetailScreen)
//   "wizard"       new blank instance            (InstanceWizardScreen)
//   "clone"        clone from snapshot           (CloneWizardScreen)
//   "gallery"      snapshot gallery              (SnapshotGalleryScreen)
//
// Op runner:
//   Self-contained — no runOpQueued. Each operation spawns inline with a
//   simple OpStatus bar. Operations: start, stop, restart, delete, snapshot,
//   verify, npm-reregister.  All return Promise<boolean | void>.
//
// Keyboard:
//   q / esc    close overlay (returns to project picker)
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState, useEffect, useCallback, useRef,
} from "../reactRuntime.js";
import { Box, Text, useInput } from "../runtimeInk.js";

import {
  loadRegistry,
} from "../zone/supabase-factory.js";
import type { RuntimeInstance, HealthState } from "../zone/supabase-factory.js";

import {
  startCoreStack,
  stopCoreStack,
  restartCoreStack,
  deleteRuntimeInstance,
  reregisterInstanceNpm,
  verifyCoreStack,
  buildConnectionSheet,
  buildMcpConfig,
  updateInstancePassword,
  updateInstanceDashboardPassword,
  postgresConnStr,
  instanceStudioPageUrl,
  instanceStudioMcpPageUrl,
} from "../db-api.ts";

import { snapshotInstance } from "../zone/snapshot.ts";
import type { SnapshotBundle } from "../zone/snapshot.ts";
import { createBlankDatabase } from "../zone/database-manager.js";
import { cloneFromSnapshot }   from "../zone/database-manager.js";

import { openBrowser }         from "@/utils/browser.ts";
import { KeyHints }            from "../components/KeyHint.tsx";
import { TextInput }           from "../components/TextInput.tsx";
import { SelectMenu, type SelectOption } from "../components/SelectMenu.tsx";
import { Divider }             from "../components/Divider.tsx";
import { InstanceWizardScreen } from "../../screens/InstanceWizardScreen.js";
import { CloneWizardScreen }   from "../../screens/CloneWizardScreen.js";
import { SnapshotGalleryScreen } from "../../screens/SnapshotGalleryScreen.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const BRAND = "#D4A27F";

// ── Shared helpers (mirrors DbPanel — keep in sync) ───────────────────────────

function studioPublicUrl(inst: RuntimeInstance): string {
  const raw = inst.npmStudioUrl ?? instanceStudioPageUrl(inst);
  return raw.includes("/project/") ? raw : raw.replace(/\/?$/, "/project/default");
}

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

// ── OpStatus bar ───────────────────────────────────────────────────────────────

interface OpStatus {
  label:  string;
  state:  "running" | "ok" | "error";
  lines:  string[];
}

function OpStatusBar({ op }: { op: OpStatus | null }) {
  if (!op) return null;
  const color = op.state === "ok" ? "green" : op.state === "error" ? "red" : "yellow";
  const icon  = op.state === "ok" ? "✓" : op.state === "error" ? "✗" : "⟳";
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color}>{icon}  {op.label}</Text>
      {op.lines.slice(-3).map((l, i) => (
        <Text key={i} dimColor>{l}</Text>
      ))}
    </Box>
  );
}

// ── InstanceDetail inline ──────────────────────────────────────────────────────

function InstanceDetail({ inst, didCopy }: { inst: RuntimeInstance; didCopy: boolean }) {
  const localStudio = instanceStudioPageUrl(inst);
  const localApi    = `http://localhost:${inst.ports.kong}`;
  const pgConn      = postgresConnStr(inst.secrets.postgresPassword, inst.ports.postgres);

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Box gap={2} marginBottom={0}>
        <Text bold>{inst.name}</Text>
        <Text color={statusColor(inst.status)}>{statusDot(inst.status)} {inst.status}</Text>
        <Text color={healthColor(inst.healthState)} dimColor>{inst.healthState}</Text>
        {inst.lastSnapshot && <Text dimColor>· snap {fmtDate(inst.lastSnapshot)}</Text>}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor bold>Local  <Text dimColor>(no NPM — localhost only)</Text></Text>
        <Box gap={1}><Text dimColor>{"  Studio  "}</Text><Text color="green">{localStudio}</Text><Text dimColor>  [u]</Text></Box>
        <Box gap={1}><Text dimColor>{"  API     "}</Text><Text>{localApi}</Text></Box>
        <Box gap={1}><Text dimColor>{"  PG      "}</Text><Text dimColor>{pgConn}</Text></Box>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Box gap={1}><Text dimColor>{"anon    "}</Text><Text color="yellow" dimColor>{truncKey(inst.secrets.anonKey)}</Text></Box>
        <Box gap={1}><Text dimColor>{"svc     "}</Text><Text color="yellow" dimColor>{truncKey(inst.secrets.serviceRoleKey)}</Text></Box>
      </Box>
      <Box marginTop={1} gap={3}>
        {didCopy
          ? <Text color="green">✓ copied to clipboard</Text>
          : <><Text dimColor>[c] copy connection sheet</Text><Text dimColor>[m] copy MCP config</Text><Text dimColor>[↵] full detail</Text></>
        }
      </Box>
    </Box>
  );
}

// ── InstanceDetailScreen full ──────────────────────────────────────────────────

interface InstanceDetailScreenProps {
  inst:             RuntimeInstance;
  onBack:           () => void;
  onCopy:           (text: string) => void;
  onInstanceAction: (action: string, inst: RuntimeInstance) => void;
  onOpenGallery:    (inst: RuntimeInstance) => void;
}

function InstanceDetailScreen({ inst, onBack, onCopy, onInstanceAction, onOpenGallery }: InstanceDetailScreenProps) {
  const [liveInst,    setLiveInst]    = useState<RuntimeInstance>(inst);
  const [didCopy,     setDidCopy]     = useState(false);
  const [showSecrets, setShowSecrets] = useState(true);
  const [editing,     setEditing]     = useState<"pg" | "dash" | null>(null);
  const [editStatus,  setEditStatus]  = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const updatingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void verifyCoreStack(liveInst).then((report) => {
      if (cancelled) return;
      const liveStatus: RuntimeInstance["status"] = report.runningCount > 0 ? "running" : "stopped";
      if (liveStatus !== liveInst.status || report.overall !== liveInst.healthState) {
        setLiveInst((prev) => ({ ...prev, status: liveStatus, healthState: report.overall }));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst.id]);

  const localStudio = instanceStudioPageUrl(liveInst);
  const localApi    = `http://localhost:${liveInst.ports.kong}`;
  const pgConn      = postgresConnStr(liveInst.secrets.postgresPassword, liveInst.ports.postgres);

  const doCopy = useCallback((text: string) => {
    onCopy(text);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, [onCopy]);

  useInput((input, key) => {
    if (editing) return;
    if (key.escape || input === "q") { onBack(); return; }
    if (input === "u") { doCopy(liveInst.secrets.dashboardPassword); void openBrowser(studioPublicUrl(liveInst)); return; }
    if (input === "U") { void openBrowser(localStudio); return; }
    if (input === "h") { setShowSecrets((v) => !v); return; }
    if (input === "e") { setEditing("pg");   setEditStatus(null); return; }
    if (input === "E") { setEditing("dash"); setEditStatus(null); return; }
    if (input === "c") {
      doCopy(buildConnectionSheet({ label: liveInst.name, kongUrl: localApi, studioUrl: localStudio, studioMcpUrl: instanceStudioMcpPageUrl(liveInst), anonKey: liveInst.secrets.anonKey, svcKey: liveInst.secrets.serviceRoleKey, pgConn }));
      return;
    }
    if (input === "m") { doCopy(buildMcpConfig({ kongUrl: localApi, svcKey: liveInst.secrets.serviceRoleKey, pgConn })); return; }
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
      if (ok) { setLiveInst((p) => ({ ...p, secrets: { ...p.secrets, postgresPassword: newVal } })); setEditStatus("✓ PG password updated"); setNeedsRestart(true); }
      else { setEditStatus(`✗ ${lines[lines.length - 1] ?? "update failed"}`); }
    } else if (editing === "dash") {
      const lines: string[] = [];
      const ok = await updateInstanceDashboardPassword(liveInst, newVal, (l) => lines.push(l));
      if (ok) { setLiveInst((p) => ({ ...p, secrets: { ...p.secrets, dashboardPassword: newVal } })); setEditStatus("✓ Dashboard password updated"); }
      else { setEditStatus(`✗ ${lines[lines.length - 1] ?? "update failed"}`); }
    }
    setEditing(null);
    updatingRef.current = false;
  }, [editing, liveInst]);

  const LabelCol = 12;
  const masked   = (s: string) => showSecrets ? s : "•".repeat(Math.min(s.length, 20));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2} marginBottom={1}>
        <Text bold color="magenta">⬡  {liveInst.name}</Text>
        <Text color={statusColor(liveInst.status)}>{statusDot(liveInst.status)} {liveInst.status}</Text>
        <Text color={healthColor(liveInst.healthState)} dimColor>{liveInst.healthState}</Text>
        {needsRestart && <Text color="yellow"> ⚠ restart recommended</Text>}
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="green">Local  <Text dimColor color="green">(localhost only · no NPM)</Text></Text>
        <Box gap={1}><Text dimColor>{"  Studio".padEnd(LabelCol)}</Text><Text color="green">{localStudio}</Text><Text dimColor>  [u]</Text></Box>
        <Box gap={1}><Text dimColor>{"  API".padEnd(LabelCol)}</Text><Text>{localApi}</Text></Box>
        <Box gap={1}><Text dimColor>{"  Postgres".padEnd(LabelCol)}</Text><Text dimColor>{pgConn}</Text></Box>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Box gap={2}><Text bold dimColor>Credentials</Text><Text dimColor>[h] {showSecrets ? "hide" : "show"}</Text></Box>
        <Box gap={1} alignItems="center">
          <Text dimColor>{"  PG pass".padEnd(LabelCol)}</Text>
          {editing === "pg"
            ? <TextInput active width={36} placeholder="new password…" onSubmit={(v) => { void handlePasswordSubmit(v); }} onCancel={() => { setEditing(null); setEditStatus(null); }} />
            : <><Text color={showSecrets ? "yellow" : "gray"}>{masked(liveInst.secrets.postgresPassword)}</Text><Text dimColor>  [e] edit</Text></>
          }
        </Box>
        <Box gap={1} alignItems="center">
          <Text dimColor>{"  Studio pass".padEnd(LabelCol)}</Text>
          {editing === "dash"
            ? <TextInput active width={36} placeholder="new password…" onSubmit={(v) => { void handlePasswordSubmit(v); }} onCancel={() => { setEditing(null); setEditStatus(null); }} />
            : <><Text color={showSecrets ? "yellow" : "gray"}>{masked(liveInst.secrets.dashboardPassword)}</Text><Text dimColor>  [E] edit</Text></>
          }
        </Box>
        <Box gap={1}><Text dimColor>{"  anon key".padEnd(LabelCol)}</Text><Text color="yellow" dimColor>{truncKey(liveInst.secrets.anonKey, 52)}</Text></Box>
        <Box gap={1}><Text dimColor>{"  svc key".padEnd(LabelCol)}</Text><Text color="yellow" dimColor>{truncKey(liveInst.secrets.serviceRoleKey, 52)}</Text></Box>
      </Box>
      {editStatus && <Box marginBottom={1}><Text color={editStatus.startsWith("✓") ? "green" : editStatus.startsWith("✗") ? "red" : "yellow"}>{editStatus}</Text></Box>}
      {didCopy && <Text color="green" dimColor>✓ copied</Text>}
      {!editing && (
        <Box flexDirection="column" marginTop={1} gap={0}>
          <ActionGroup label="Connect" hints={[{ k: "u", label: "open Studio (local)" }, { k: "c", label: "copy conn. sheet" }, { k: "m", label: "copy MCP config" }]} />
          <ActionGroup label="Operate" hints={[{ k: "r", label: "restart" }, { k: "x", label: "stop" }, { k: "v", label: "verify" }, { k: "d", label: "delete" }]} />
          <ActionGroup label="Protect" hints={[{ k: "s", label: "snapshot" }, { k: "g", label: "gallery" }]} />
        </Box>
      )}
      {!editing && <KeyHints hints={[{ k: "esc/q", label: "back" }, { k: "e/E", label: "edit creds" }, { k: "u", label: "open Studio" }]} />}
    </Box>
  );
}

// ── InstancesSection ───────────────────────────────────────────────────────────

interface InstancesSectionProps {
  instances:        RuntimeInstance[];
  detailInst:       RuntimeInstance | null;
  onSetDetailInst:  (inst: RuntimeInstance | null) => void;
  onInstanceAction: (action: string, inst: RuntimeInstance) => void;
  onNewInstance:    () => void;
  onOpenGallery:    (inst: RuntimeInstance) => void;
  onCopy:           (text: string) => void;
  onRefresh:        () => void;
  opStatus:         OpStatus | null;
}

function InstancesSection({
  instances, detailInst, onSetDetailInst, onInstanceAction,
  onNewInstance, onOpenGallery, onCopy, onRefresh, opStatus,
}: InstancesSectionProps) {
  const [highlighted, setHighlighted] = useState<RuntimeInstance | null>(instances[0] ?? null);
  const [didCopy,     setDidCopy]     = useState(false);

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
      const pgConn  = postgresConnStr(highlighted.secrets.postgresPassword, highlighted.ports.postgres);
      const localKong = `http://localhost:${highlighted.ports.kong}`;
      doCopy(buildConnectionSheet({ label: highlighted.name, kongUrl: localKong, studioUrl: instanceStudioPageUrl(highlighted), studioMcpUrl: instanceStudioMcpPageUrl(highlighted), anonKey: highlighted.secrets.anonKey, svcKey: highlighted.secrets.serviceRoleKey, pgConn }));
      return;
    }
    if (input === "m") {
      const pgConn = postgresConnStr(highlighted.secrets.postgresPassword, highlighted.ports.postgres);
      doCopy(buildMcpConfig({ kongUrl: `http://localhost:${highlighted.ports.kong}`, svcKey: highlighted.secrets.serviceRoleKey, pgConn }));
      return;
    }
    if (input === "r") { onInstanceAction("restart",  highlighted); return; }
    if (input === "x") { onInstanceAction("stop",     highlighted); return; }
    if (input === "d") { onInstanceAction("delete",   highlighted); return; }
    if (input === "s") { onInstanceAction("snapshot", highlighted); return; }
    if (input === "v") { onInstanceAction("verify",   highlighted); return; }
    if (input === "g") { onOpenGallery(highlighted); return; }
    if (input === "n") { onNewInstance(); return; }
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
        <Text dimColor>branches · labs · side-project runtimes</Text>
        {instances.length > 0 && <Text dimColor>· {instances.length} instance{instances.length !== 1 ? "s" : ""}</Text>}
      </Box>

      <OpStatusBar op={opStatus} />

      {instances.length === 0 ? (
        <Box flexDirection="column" paddingX={2} gap={1}>
          <Text dimColor>No runtime instances yet.</Text>
          <Box paddingTop={1} gap={2}>
            <Text color="magenta">[n] new blank instance</Text>
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
            <ActionGroup label="Operate" hints={[{ k: "r", label: "restart" }, { k: "x", label: "stop" }, { k: "v", label: "verify" }, { k: "d", label: "delete" }]} />
            <ActionGroup label="Protect" hints={[{ k: "s", label: "snapshot" }, { k: "g", label: "gallery" }]} />
            <ActionGroup label="Connect" hints={[{ k: "u", label: "open Studio" }, { k: "c", label: "copy conn. sheet" }, { k: "m", label: "copy MCP config" }]} />
            <ActionGroup label="New"     hints={[{ k: "n", label: "new blank instance" }, { k: "f", label: "refresh" }]} />
          </Box>
        </>
      )}

      <KeyHints hints={[{ k: "↑↓/jk", label: "navigate" }, { k: "↵", label: "full detail" }, { k: "s", label: "snapshot" }, { k: "d", label: "delete" }, { k: "f", label: "refresh" }]} />
    </Box>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface RuntimeInstancesOverlayProps {
  onClose: () => void;
}

// ── Main overlay ───────────────────────────────────────────────────────────────

type SubPhase = "list" | "detail" | "wizard" | "clone" | "gallery";

export function RuntimeInstancesOverlay({ onClose }: RuntimeInstancesOverlayProps) {
  const [subPhase,    setSubPhase]    = useState<SubPhase>("list");
  const [instances,   setInstances]   = useState<RuntimeInstance[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [detailInst,  setDetailInst]  = useState<RuntimeInstance | null>(null);
  const [galleryInst, setGalleryInst] = useState<RuntimeInstance | null>(null);
  const [cloneBundle, setCloneBundle] = useState<SnapshotBundle | null>(null);
  const [opStatus,    setOpStatus]    = useState<OpStatus | null>(null);
  const [didCopy,     setDidCopy]     = useState(false);

  // ── Load instances ────────────────────────────────────────────────────────
  const loadInstances = useCallback(() => {
    setLoading(true);
    loadRegistry().then((list) => {
      setInstances(list);
      setLoading(false);
    }).catch(() => { setLoading(false); });
  }, []);

  useEffect(() => { loadInstances(); }, [loadInstances]);

  // ── Copy helper ───────────────────────────────────────────────────────────
  const doCopy = useCallback((text: string) => {
    try { process.stdout.write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`); } catch {}
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }, []);

  // ── Inline op runner ──────────────────────────────────────────────────────
  const runOp = useCallback((label: string, fn: (onLine: (l: string) => void) => Promise<boolean | void>) => {
    setOpStatus({ label, state: "running", lines: [] });
    fn((line) => setOpStatus((prev) => prev ? { ...prev, lines: [...prev.lines, line] } : prev))
      .then((ok) => {
        setOpStatus((prev) => prev ? { ...prev, state: ok === false ? "error" : "ok" } : prev);
        // Refresh list after destructive ops
        loadInstances();
        setTimeout(() => setOpStatus(null), 4000);
      })
      .catch((err) => {
        setOpStatus((prev) => prev ? { ...prev, state: "error", lines: [...(prev?.lines ?? []), String(err)] } : prev);
        setTimeout(() => setOpStatus(null), 6000);
      });
  }, [loadInstances]);

  // ── Instance action dispatcher ────────────────────────────────────────────
  const handleInstanceAction = useCallback((action: string, inst: RuntimeInstance) => {
    switch (action) {
      case "restart":  runOp(`Restart ${inst.name}`,  (o) => restartCoreStack(inst, o));  break;
      case "stop":     runOp(`Stop ${inst.name}`,     (o) => stopCoreStack(inst, o));     break;
      case "delete":   runOp(`Delete ${inst.name}`,   (o) => deleteRuntimeInstance(inst, o)); break;
      case "snapshot": runOp(`Snapshot ${inst.name}`, (o) => snapshotInstance(inst, o)); break;
      case "verify":   runOp(`Verify ${inst.name}`,   async (o) => { const r = await verifyCoreStack(inst, o); o(`Overall: ${r.overall}  (${r.runningCount}/${r.totalCount})`); return r.overall !== "down"; }); break;
      case "npm":      runOp(`NPM register ${inst.name}`, (o) => reregisterInstanceNpm(inst, o)); break;
    }
  }, [runOp]);

  // ── Top-level keyboard: only close when in list (sub-screens own their keys)
  useInput((input, key) => {
    if (subPhase !== "list") return;
    if (detailInst) return;
    if (input === "q" || key.escape) {
      onClose();
    }
  });

  // ── Sub-phase: gallery ────────────────────────────────────────────────────
  if (subPhase === "gallery" && galleryInst) {
    return (
      <SnapshotGalleryScreen
        instance={galleryInst}
        onRestore={(bundle) => {
          setGalleryInst(null);
          setSubPhase("list");
          runOp(`Restore ${galleryInst.name} ← ${bundle.id}`, async (o) => {
            const { restoreInstance } = await import("../zone/snapshot.ts");
            await restoreInstance(bundle.bundlePath, o);
          });
        }}
        onBack={() => { setGalleryInst(null); setSubPhase("list"); }}
      />
    );
  }

  // ── Sub-phase: wizard (new blank instance) ────────────────────────────────
  if (subPhase === "wizard") {
    return (
      <InstanceWizardScreen
        onDeploy={(name) => {
          setSubPhase("list");
          runOp(`New Instance  ${name}`, async (o) => {
            await createBlankDatabase(name, { registerNpm: false, instanceName: name }, o);
          });
        }}
        onCancel={() => setSubPhase("list")}
      />
    );
  }

  // ── Sub-phase: clone wizard ────────────────────────────────────────────────
  if (subPhase === "clone" && cloneBundle) {
    return (
      <CloneWizardScreen
        bundle={cloneBundle}
        onDeploy={(name) => {
          const bundlePath = cloneBundle.bundlePath;
          setCloneBundle(null);
          setSubPhase("list");
          runOp(`Clone → ${name}`, async (o) => {
            await cloneFromSnapshot(bundlePath, name, { registerNpm: false }, o);
          });
        }}
        onCancel={() => { setCloneBundle(null); setSubPhase("list"); }}
      />
    );
  }

  // ── Main list phase ────────────────────────────────────────────────────────
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={BRAND}
      paddingX={2}
      paddingY={1}
      minWidth={60}
    >
      {/* Header */}
      <Box marginBottom={1} gap={2} alignItems="center">
        <Text bold color={BRAND}>⬡  Runtime Instances</Text>
        <Text dimColor>global · pre-project</Text>
        <Text dimColor color="gray">  esc close</Text>
      </Box>

      {loading ? (
        <Box paddingX={1}><Text dimColor>Loading…</Text></Box>
      ) : (
        <InstancesSection
          instances={instances}
          detailInst={detailInst}
          onSetDetailInst={(inst) => {
            setDetailInst(inst);
          }}
          onInstanceAction={handleInstanceAction}
          onNewInstance={() => setSubPhase("wizard")}
          onOpenGallery={(inst) => { setGalleryInst(inst); setSubPhase("gallery"); }}
          onCopy={doCopy}
          onRefresh={loadInstances}
          opStatus={opStatus}
        />
      )}
    </Box>
  );
}
