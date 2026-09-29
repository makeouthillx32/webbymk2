// src/ink/panels/Deployments/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Deployments Panel — Vercel / GitHub style timeline of builds and deploys.
//
// Displays:
//   • Status: Ready (green), Building (yellow), Error (red)
//   • Durations: e.g. 25s, 1m 26s
//   • Production Stability: Clear indication of the currently active Production
//     deployment. If a new build fails, the prior successful build remains
//     designated as active Production.
//   • Provenance: Commit SHA, commit message, author, branch, image
//   • Filters: By Zone, Target (Production / Preview), Status (Ready / Building / Error)
//   • Actions: Rollback / Redeploy [r], Build+deploy [b], Promote [p], Logs [l]
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "../../runtimeInk.js";
import { KeyHints } from "../../components/KeyHint.tsx";
import {
  dbGetDeployments,
  dbGetActiveProductionDeployment,
  dbPromoteDeploymentToProduction,
  type DeploymentRecord,
} from "../../control-db.ts";
import { loadZones } from "../../zone-store.ts";
import type { Zone } from "../../../config/zones.ts";
import { buildAndDeploy, deployZone } from "../../zone-build.ts";

interface DeploymentsPanelProps {
  onGoBack: () => void;
  runOp?: (title: string, op: (o: (l: string) => void) => Promise<number>) => void;
  openLogs?: (zone: Zone) => void;
  addNotification?: (msg: string, tone?: "success" | "error" | "info") => void;
  filterZoneKey?: string | null;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "--";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec === 0 ? `${min}m` : `${min}m ${remSec}s`;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 60_000) return "just now";
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function DeploymentsPanel({
  onGoBack,
  runOp,
  openLogs,
  addNotification,
  filterZoneKey = null,
}: DeploymentsPanelProps) {
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Filters
  const [zoneFilter, setZoneFilter] = useState<string>(filterZoneKey || "all");
  const [targetFilter, setTargetFilter] = useState<string>("all"); // "all" | "production" | "preview"
  const [statusFilter, setStatusFilter] = useState<string>("all"); // "all" | "ready" | "building" | "error"

  // Refresh deployments from SQLite
  const refreshDeployments = useCallback(() => {
    try {
      const records = dbGetDeployments({
        zoneKey: zoneFilter !== "all" ? zoneFilter : undefined,
        target: targetFilter !== "all" ? targetFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: 40,
      });
      setDeployments(records);
      setSelectedIdx((prev) => Math.min(prev, Math.max(0, records.length - 1)));
    } catch {
      // fallback
    }
  }, [zoneFilter, targetFilter, statusFilter]);

  useEffect(() => {
    loadZones().then((z) => setZones(z)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshDeployments();
  }, [refreshDeployments]);

  // Available zone keys for cycling filter
  const zoneOptions = useMemo(() => {
    const keys = ["all", ...zones.map((z) => z.key)];
    return Array.from(new Set(keys));
  }, [zones]);

  const selectedItem: DeploymentRecord | undefined = deployments[selectedIdx];

  // Active production deployment for the selected item's zone
  const activeProdForSelectedZone = useMemo(() => {
    if (!selectedItem) return null;
    return dbGetActiveProductionDeployment(selectedItem.zoneKey);
  }, [selectedItem]);

  // Cycle filters
  const cycleZoneFilter = useCallback(() => {
    const idx = zoneOptions.indexOf(zoneFilter);
    const next = zoneOptions[(idx + 1) % zoneOptions.length] || "all";
    setZoneFilter(next);
    setSelectedIdx(0);
  }, [zoneFilter, zoneOptions]);

  const cycleTargetFilter = useCallback(() => {
    const targets = ["all", "production", "preview"];
    const idx = targets.indexOf(targetFilter);
    const next = targets[(idx + 1) % targets.length] || "all";
    setTargetFilter(next);
    setSelectedIdx(0);
  }, [targetFilter]);

  const cycleStatusFilter = useCallback(() => {
    const statuses = ["all", "ready", "building", "error"];
    const idx = statuses.indexOf(statusFilter);
    const next = statuses[(idx + 1) % statuses.length] || "all";
    setStatusFilter(next);
    setSelectedIdx(0);
  }, [statusFilter]);

  // Keyboard navigation & actions
  useInput((input, key) => {
    if (key.escape || input === "q") {
      onGoBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIdx((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIdx((prev) => Math.min(Math.max(0, deployments.length - 1), prev + 1));
      return;
    }

    // Filter toggles
    if (input === "z") {
      cycleZoneFilter();
      return;
    }
    if (input === "t") {
      cycleTargetFilter();
      return;
    }
    if (input === "s") {
      cycleStatusFilter();
      return;
    }

    // Refresh
    if (input === "R") {
      refreshDeployments();
      addNotification?.("Deployments refreshed", "info");
      return;
    }

    // Action: Promote to production
    if (input === "p" && selectedItem) {
      if (selectedItem.status !== "ready") {
        addNotification?.(`Cannot promote ${selectedItem.status} build to Production`, "error");
        return;
      }
      dbPromoteDeploymentToProduction(selectedItem.id, selectedItem.zoneKey);
      refreshDeployments();
      addNotification?.(`✓ Promoted ${selectedItem.commitSha || selectedItem.id.slice(0, 7)} to Production for ${selectedItem.zoneKey}`, "success");
      return;
    }

    // Action: Rollback / Redeploy this build
    if (input === "r" && selectedItem && runOp) {
      const zone = zones.find((z) => z.key === selectedItem.zoneKey);
      if (!zone) {
        addNotification?.(`Zone ${selectedItem.zoneKey} not found in registry`, "error");
        return;
      }
      runOp(`Redeploy ${zone.label} (${selectedItem.commitSha || "image"})`, async (o) => {
        o(`--- redeploying ${zone.label} ---`);
        o(`Image: ${selectedItem.image || zone.image}`);
        o(`Target: ${selectedItem.target}`);
        const code = await deployZone(zone, o);
        if (code === 0) {
          dbPromoteDeploymentToProduction(selectedItem.id, selectedItem.zoneKey);
          refreshDeployments();
        }
        return code;
      });
      return;
    }

    // Action: Build & Deploy fresh
    if (input === "b" && selectedItem && runOp) {
      const zone = zones.find((z) => z.key === selectedItem.zoneKey);
      if (!zone) {
        addNotification?.(`Zone ${selectedItem.zoneKey} not found in registry`, "error");
        return;
      }
      runOp(`Build+deploy ${zone.label}`, async (o) => {
        return await buildAndDeploy(zone, o);
      });
      return;
    }

    // Action: View Logs
    if (input === "l" && selectedItem && openLogs) {
      const zone = zones.find((z) => z.key === selectedItem.zoneKey);
      if (zone) {
        openLogs(zone);
      }
      return;
    }
  });

  const HINTS = [
    { k: "↑↓/jk", label: "navigate" },
    { k: "z",     label: `zone: ${zoneFilter}` },
    { k: "t",     label: `target: ${targetFilter}` },
    { k: "s",     label: `status: ${statusFilter}` },
    { k: "r",     label: "redeploy/rollback" },
    { k: "b",     label: "build" },
    { k: "p",     label: "promote prod" },
    { k: "q/←",   label: "back" },
  ];

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      {/* ── Top Header & Filter Bar ──────────────────────────────────────── */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box gap={1}>
          <Text bold color="cyan">Deployments</Text>
          <Text dimColor>·</Text>
          <Text dimColor>Author <Text color="white">makeouthillx32</Text></Text>
        </Box>
        <Box gap={2}>
          <Text>
            Zone: <Text bold color={zoneFilter !== "all" ? "cyan" : "gray"}>[{zoneFilter}]</Text>
          </Text>
          <Text>
            Target: <Text bold color={targetFilter !== "all" ? "magenta" : "gray"}>[{targetFilter}]</Text>
          </Text>
          <Text>
            Status: <Text bold color={statusFilter !== "all" ? "yellow" : "gray"}>[{statusFilter}]</Text>
          </Text>
          <Text dimColor>({deployments.length} builds)</Text>
        </Box>
      </Box>

      {/* ── Empty State ──────────────────────────────────────────────────── */}
      {deployments.length === 0 && (
        <Box padding={2} borderStyle="round" borderColor="gray">
          <Text dimColor>No deployments match the selected filters. Press [z], [t], or [s] to reset.</Text>
        </Box>
      )}

      {/* ── Main List & Details Layout ──────────────────────────────────── */}
      {deployments.length > 0 && (
        <Box flexDirection="column" flexGrow={1}>
          {/* Scrollable list of recent deployments (up to 7 visible at once) */}
          <Box flexDirection="column" gap={0}>
            {deployments.slice(0, 8).map((dep, idx) => {
              const isSelected = idx === selectedIdx;

              // Status styling
              let statusSymbol = "●";
              let statusColor: "green" | "yellow" | "red" | "gray" = "green";
              let statusText = "Ready";

              if (dep.status === "building") {
                statusSymbol = "⟳";
                statusColor = "yellow";
                statusText = "Building";
              } else if (dep.status === "error") {
                statusSymbol = "✖";
                statusColor = "red";
                statusText = "Error";
              }

              // Production state badge
              const isCurrentProd = dep.isProduction;

              return (
                <Box
                  key={dep.id}
                  flexDirection="column"
                  paddingX={1}
                  paddingY={0}
                  borderStyle={isSelected ? "round" : undefined}
                  borderColor={isSelected ? "cyan" : undefined}
                  marginBottom={isSelected ? 0 : 0}
                >
                  {/* Line 1: Status · Duration · Target Badge · Zone · Date */}
                  <Box flexDirection="row" justifyContent="space-between">
                    <Box gap={1} alignItems="center">
                      <Text color={statusColor} bold>{statusSymbol} {statusText}</Text>
                      <Text dimColor color={statusColor === "red" ? "red" : "cyan"}>{formatDuration(dep.durationMs)}</Text>

                      {/* Production active indicator */}
                      {isCurrentProd ? (
                        <Text bold color="green">
                          [● Production]
                        </Text>
                      ) : dep.target === "production" ? (
                        <Text dimColor color="gray">
                          [Production (prior)]
                        </Text>
                      ) : (
                        <Text dimColor color="magenta">
                          [Preview]
                        </Text>
                      )}

                      <Text bold color="white">[{dep.zoneKey}]</Text>
                    </Box>

                    <Box gap={1}>
                      <Text dimColor>{formatDate(dep.createdAt)}</Text>
                    </Box>
                  </Box>

                  {/* Line 2: Commit message */}
                  <Box paddingLeft={2}>
                    <Text bold={isSelected} color={isSelected ? "white" : "gray"}>
                      {dep.commitMsg.length > 68 ? dep.commitMsg.slice(0, 68) + "…" : dep.commitMsg}
                    </Text>
                  </Box>

                  {/* Line 3: Provenance (SHA, Branch, Author, Error) */}
                  <Box paddingLeft={2} gap={2}>
                    <Text bold color="cyan">{dep.commitSha || dep.id.slice(0, 7)}</Text>
                    <Text color="magenta">⎇ {dep.branch}</Text>
                    <Text dimColor>by {dep.author || "makeouthillx32"}</Text>
                    {dep.errorMessage ? (
                      <Text color="red">⚠ {dep.errorMessage.slice(0, 42)}…</Text>
                    ) : null}
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* ── Selected Deployment Inspector Card ────────────────────────── */}
          {selectedItem && (
            <Box
              marginTop={1}
              paddingX={1}
              paddingY={0}
              flexDirection="column"
              borderStyle="single"
              borderColor="gray"
            >
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold color="cyan">
                  Deployment {selectedItem.commitSha || selectedItem.id.slice(0, 7)}
                </Text>
                {selectedItem.isProduction ? (
                  <Text bold color="green">
                    ● CURRENT PRODUCTION (Active on {selectedItem.zoneKey}.unenter.live)
                  </Text>
                ) : selectedItem.status === "error" ? (
                  <Text bold color="red">
                    ✖ BUILD FAILED · Fallback to prior active build ({activeProdForSelectedZone?.commitSha || "active"})
                  </Text>
                ) : (
                  <Text dimColor>
                    ○ {selectedItem.target === "production" ? "Prior Production Build" : "Preview Branch Build"}
                  </Text>
                )}
              </Box>

              <Box flexDirection="row" gap={3} marginTop={0}>
                <Text dimColor>
                  Zone: <Text color="white">{selectedItem.zoneKey}</Text>
                </Text>
                <Text dimColor>
                  Duration: <Text color="cyan">{formatDuration(selectedItem.durationMs)}</Text> ({selectedItem.durationMs.toLocaleString()}ms)
                </Text>
                <Text dimColor>
                  Branch: <Text color="magenta">{selectedItem.branch}</Text>
                </Text>
                <Text dimColor>
                  Image: <Text color="gray">{selectedItem.image ? selectedItem.image.split("/").pop() : `${selectedItem.zoneKey}:latest`}</Text>
                </Text>
              </Box>

              {selectedItem.errorMessage && (
                <Box marginTop={0}>
                  <Text color="red">Error Detail: {selectedItem.errorMessage}</Text>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* ── Footer Hints ─────────────────────────────────────────────────── */}
      <KeyHints hints={HINTS} marginTop={1} />
    </Box>
  );
}
