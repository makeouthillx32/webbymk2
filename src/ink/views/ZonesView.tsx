// src/ink/views/ZonesView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Self-contained view for the "zones" panel tab.
//
// Owns:
//   • selected        — cursor position in the zone list
//   • actionOpen      — whether the ActionPanel overlay is visible
//   • actionSelected  — cursor position inside the ActionPanel
//   • confirmDelete   — Zone pending confirmation before delete runs
//   • executeAction() — the 9-case switch that dispatches zone operations
//   • useInput        — all keyboard handling for this view
//
// Receives as props:
//   zones / zoneStatuses / proxyStatus — from useZoneManager
//   setZones        — to update the list after delete / create
//   runOp           — from useBackgroundOps
//   openLogs        — from useBackgroundOps
//   addNotification — from useNotifications
//   onGoBack        — callback to pop one history level (q from zone list)
//   onNewZone       — callback to open the ZoneWizardScreen
//   isActive        — passed to useInput; false when the stack pane is focused
//
// isActive must be false when the global stack nav is open so j/k keystrokes
// don't simultaneously move both the stack focus AND the zone cursor.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, useInput }          from "ink";

import type { Zone }    from "../../config/zones.ts";
import type { Status }  from "../docker.ts";
import type { LayoutType } from "../zone-scaffold.ts";

import { ZonesPanel }                                              from "../panels/Zones/index.tsx";
import { ActionPanel, buildActions, firstEnabled, isCoreZone }    from "../panels/Action/index.tsx";
import { Dialog }                                                  from "../components/design-system/Dialog.tsx";
import { MultiSelectMenu }                                         from "../components/MultiSelectMenu.tsx";
import { SearchInput }                                             from "../components/SearchBox.tsx";
import { fuzzyFilter }                                             from "../utils/fuzzy.ts";

import {
  restartZone, pullAndUp, reloadProxy,
  doctorComposeService,
}                             from "../docker.ts";
import { buildZone, buildAll, deployAll, deployZone, gitPush } from "../zone-build.ts";
import { npmAddZone }         from "../npm-api.ts";
import { deleteZone, DS_CATALOG } from "../zone-scaffold.ts";
import { addZoneRoute, getRoutes } from "../proxy-config.ts";
import { invalidateZoneCache, loadZones } from "../zone-store.ts";
import {
  getZoneLayout, getInstalledSections,
  scaffoldDynamicSection, removeDynamicSection,
  zoneToDerived,
} from "../zone-ops.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusMap = Record<string, Status>;

function zoneSearchText(zone: Zone): string {
  return [
    zone.label,
    zone.key,
    zone.domain,
    zone.service,
    zone.container,
    zone.image,
    zone.dockerfile ?? "",
    zone.upstreamEnvKey,
  ].join(" ");
}

interface ZonesViewProps {
  zones:           Zone[];
  zoneStatuses:    StatusMap;
  proxyStatus:     Status;
  setZones:        React.Dispatch<React.SetStateAction<Zone[]>>;
  runOp:           (title: string, op: (o: (l: string) => void) => Promise<number>) => void;
  openLogs:        (zone: Zone) => void;
  addNotification: (msg: string, type?: "success" | "error" | "info") => void;
  /** Called when q is pressed on the zone list — pops one history level */
  onGoBack:        () => void;
  onNewZone:       () => void;
  /** false while the global stack pane is focused — suppresses zone cursor keys */
  isActive:        boolean;
}

// ── ZonesView ─────────────────────────────────────────────────────────────────

export function ZonesView({
  zones, zoneStatuses, proxyStatus,
  setZones, runOp, openLogs, addNotification,
  onGoBack, onNewZone, isActive,
}: ZonesViewProps) {

  // Strip core (key="unenter") — it's not a zone and doesn't belong here.
  const realZones = useMemo(() => zones.filter((z) => !isCoreZone(z)), [zones]);

  const [selected,       setSelected]       = useState(0);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [searchActive,   setSearchActive]   = useState(false);
  const [actionOpen,     setActionOpen]     = useState(false);
  const [actionSelected, setActionSelected] = useState(0);
  /** Zone staged for deletion — shows confirmation dialog before running op. */
  const [confirmDelete,  setConfirmDelete]  = useState<Zone | null>(null);
  /** Zone + context for the Manage Sections overlay. */
  const [manageSections, setManageSections] = useState<{
    zone:      Zone;
    layout:    LayoutType;
    installed: Set<string>;
  } | null>(null);

  const visibleZones = useMemo(
    () => fuzzyFilter(realZones, searchQuery, zoneSearchText),
    [realZones, searchQuery],
  );

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setSelected(0);
  }, []);

  const cancelSearch = useCallback(() => {
    if (searchQuery) {
      setSearchQuery("");
      setSelected(0);
    }
    setSearchActive(false);
  }, [searchQuery]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, visibleZones.length - 1)));
  }, [visibleZones.length]);

  // ── Action executor ──────────────────────────────────────────────────────
  const executeAction = useCallback((actionId: string, zone: Zone) => {
    switch (actionId) {

      case "deploy":
        runOp(`Deploy  ${zone.label}`, (o) => deployZone(zone, o));
        break;

      case "pull":
        runOp(`Pull+up  ${zone.label}`, (o) => pullAndUp(zone, o));
        break;

      case "restart":
        runOp(`Restart  ${zone.label}`, (o) => restartZone(zone, o));
        break;

      case "build":
        runOp(`Build+push  ${zone.label}`, async (o) => {
          if (!zone.dockerfile) {
            o(`${zone.key} has no Dockerfile — use [p] pull+up instead.`);
            return 1;
          }
          return buildZone(zone, o);
        });
        break;

      case "rebuild":
        runOp(`Rebuild  ${zone.label}  (no cache)`, async (o) => {
          if (!zone.dockerfile) {
            o(`${zone.key} has no Dockerfile — use [p] pull+up instead.`);
            return 1;
          }
          return buildZone(zone, o, { noCache: true });
        });
        break;

      case "logs":
        openLogs(zone);
        break;

      case "npm":
        runOp(`Register NPM  ${zone.domain}`, (o) => npmAddZone(zone, o));
        break;

      case "sections": {
        const layout = getZoneLayout(zone.key);
        if (!layout) {
          addNotification(`Layout not detected for "${zone.key}" — add a routeClassifier override`, "error");
          break;
        }
        const catalog = DS_CATALOG[layout] ?? [];
        if (catalog.length === 0) {
          addNotification(`"${layout}" layout has no dynamic sections`, "info");
          break;
        }
        const installed = getInstalledSections(zone.key, layout);
        setActionOpen(false);
        setManageSections({ zone, layout, installed });
        break;
      }

      case "doctor":
        runOp(`Fix routing  ${zone.label}`, async (o) => {
          // Step 1 — Fix docker-compose image: field if missing/wrong.
          o(`--- compose ---`);
          const changed = doctorComposeService(zone, o);
          if (changed) {
            o(`  compose patched — '${zone.service}' now references ${zone.image}`);
          } else {
            o(`  compose already correct`);
          }

          // Step 2 — Ensure route exists in proxy-config/routes.json.
          //   The proxy hot-reloads this file — no container restart needed.
          o(`--- proxy routes ---`);
          const routes = getRoutes();
          if (routes.zones[zone.key]) {
            o(`✓ proxy route OK  →  ${zone.domain}  →  ${routes.zones[zone.key]}`);
          } else {
            await addZoneRoute(zone.key, `http://${zone.service}:3000`, o);
          }

          // Step 3 — Verify NPM proxy host forward target is correct.
          //   npmAddZone detects wrong forward_host/forward_port and updates.
          o(`--- verify NPM ---`);
          await npmAddZone(zone, o);

          return 0;
        });
        break;

      case "delete":
        // Core zone is permanent — guard here in addition to the action list.
        if (isCoreZone(zone)) { addNotification("Core cannot be deleted", "error"); break; }
        // Close the action panel and show the confirmation dialog.
        // The actual delete runs only after the user confirms with [y].
        setActionOpen(false);
        setConfirmDelete(zone);
        break;
    }
  }, [runOp, openLogs, addNotification, setZones, setConfirmDelete]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  // isActive is also false while the confirm-delete dialog is open so [y/n]
  // don't accidentally fire zone-list navigation at the same time.
  useInput((input, key) => {

    // ── Action panel open ───────────────────────────────────────────────────
    if (actionOpen) {
      const zone    = visibleZones[selected];
      const actions = zone ? buildActions(zone) : [];

      // Both Escape and q close the action panel (one virtual level back).
      // Pressing q again from the zone list will then call onGoBack().
      if (key.escape || input === "q") { setActionOpen(false); return; }

      if (key.upArrow || input === "k") {
        setActionSelected((s) => {
          let next = s - 1;
          while (next >= 0 && actions[next]?.disabled) next--;
          return next >= 0 ? next : s;
        });
        return;
      }
      if (key.downArrow || input === "j") {
        setActionSelected((s) => {
          let next = s + 1;
          while (next < actions.length && actions[next]?.disabled) next++;
          return next < actions.length ? next : s;
        });
        return;
      }

      if (key.return) {
        const action = actions[actionSelected];
        if (!action || action.disabled || !zone) return;
        executeAction(action.id, zone);
        return;
      }

      // Shortcut keys on action rows
      const matched = actions.find((a) => !a.disabled && a.key === input);
      if (matched && zone) { executeAction(matched.id, zone); return; }
      return;
    }

    // ── Zone list ───────────────────────────────────────────────────────────
    if (searchActive) {
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow) {
        setSelected((s) => Math.min(Math.max(0, visibleZones.length - 1), s + 1));
        return;
      }
      if (key.return) {
        const zone = visibleZones[selected];
        if (!zone) return;
        setActionSelected(firstEnabled(zone));
        setActionOpen(true);
        setSearchActive(false);
        return;
      }
      return;
    }

    if (key.escape) {
      if (searchQuery) {
        setSearchQuery("");
        setSelected(0);
        return;
      }
      onGoBack();
      return;
    }

    if (input === "/") { setSearchActive(true); return; }

    if (key.upArrow   || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(Math.max(0, visibleZones.length - 1), s + 1));
      return;
    }

    if (key.return) {
      const zone = visibleZones[selected];
      if (!zone) return;
      setActionSelected(firstEnabled(zone));
      setActionOpen(true);
      return;
    }

    if (input === "l") { const z = visibleZones[selected]; if (z) openLogs(z); return; }
    if (input === "n") { onNewZone(); return; }
    if (input === "g") { runOp("Git push",         (o) => gitPush(o));           return; }
    if (input === "R") {
      runOp("Rebuild proxy  (image rebuild)", (o) => reloadProxy(o));
      return;
    }
    if (input === "S") {
      runOp("Sync proxy routes", async (o) => {
        for (const z of realZones) {
          await addZoneRoute(z.key, `http://${z.service}:3000`, o);
        }
        o(`✓ proxy-config/routes.json synced (${realZones.length} zones)`);
        return 0;
      });
      return;
    }
    if (input === "a") { runOp("Build & push all",  (o) => buildAll(realZones, o));  return; }
    if (input === "A") { runOp("Deploy all",        (o) => deployAll(realZones, o)); return; }
    if (input === "q") { onGoBack(); return; }

  }, { isActive: isActive && confirmDelete === null && manageSections === null });

  // ── Render ────────────────────────────────────────────────────────────────
  // ZonesPanel and ActionPanel are mutually exclusive — never stacked.
  // Stacking both caused the combined height to exceed the terminal height,
  // forcing Ink to scroll the viewport and leaving ghost frames behind.
  // Treating the action menu as a full-page sub-view keeps the total height
  // bounded and matches the same pattern used by every other panel.
  return (
    <Box flexDirection="column">

      {/* Zone list — hidden while any overlay is open */}
      {!actionOpen && !confirmDelete && !manageSections && (
        <>
          <Box paddingX={1} marginBottom={1} gap={2}>
            <SearchInput
              value={searchQuery}
              onChange={handleSearchChange}
              onCancel={cancelSearch}
              placeholder="Search zones"
              prefix="/"
              width={42}
              active={searchActive}
            />
            <Text dimColor>
              {searchActive
                ? "[esc] clear"
                : searchQuery
                  ? `${visibleZones.length}/${realZones.length} matches`
                  : "[/] search"}
            </Text>
          </Box>
          <ZonesPanel
            zones={visibleZones}
            zoneStatuses={zoneStatuses}
            selected={selected}
            emptyMessage={searchQuery ? `No zones match "${searchQuery}"` : undefined}
          />
        </>
      )}

      {/* Action panel — replaces zone list, not appended below it */}
      {actionOpen && visibleZones[selected] && (
        <ActionPanel
          zone={visibleZones[selected]!}
          status={zoneStatuses[visibleZones[selected]!.key] ?? "missing"}
          selected={actionSelected}
        />
      )}

      {/* Manage sections overlay */}
      {manageSections && (() => {
        const { zone, layout, installed } = manageSections;
        const catalog        = DS_CATALOG[layout] ?? [];
        // hasCore sections are always present via the Dockerfile core-app
        // preservation — they can't be toggled, so we exclude them from the
        // editable list.  Show them as a static note above the selector.
        const coreManaged    = catalog.filter((ds) =>  ds.hasCore);
        const zoneManaged    = catalog.filter((ds) => !ds.hasCore);
        const zoneInstalled  = new Set([...installed].filter(
          (id) => zoneManaged.some((ds) => ds.id === id)
        ));

        return (
          <Box flexDirection="column">
            <Box gap={2} marginBottom={1}>
              <Text bold color="cyan">{zone.label}</Text>
              <Text dimColor>·</Text>
              <Text dimColor>manage sections</Text>
              <Text dimColor>·</Text>
              <Text dimColor>{layout}</Text>
            </Box>

            {coreManaged.length > 0 && (
              <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
                <Text dimColor>Core-managed (always present — not editable):</Text>
                {coreManaged.map((ds) => (
                  <Text key={ds.id} dimColor>  ✓ {ds.label}  ({ds.routePath})</Text>
                ))}
              </Box>
            )}

            {zoneManaged.length === 0 ? (
              <Box paddingLeft={2}>
                <Text dimColor>No zone-managed sections for this layout.</Text>
              </Box>
            ) : (
              <MultiSelectMenu
                options={zoneManaged.map((ds) => ({ id: ds.id, label: ds.label, desc: ds.desc }))}
                initialSelected={zoneInstalled}
                onConfirm={(selectedIds) => {
                  const added   = zoneManaged.filter((ds) =>  selectedIds.has(ds.id) && !zoneInstalled.has(ds.id));
                  const removed = zoneManaged.filter((ds) => !selectedIds.has(ds.id) &&  zoneInstalled.has(ds.id));
                  setManageSections(null);

                  if (added.length === 0 && removed.length === 0) {
                    addNotification("No changes to sections", "info");
                    return;
                  }

                  const derived = zoneToDerived(zone, layout);
                  runOp(`Manage sections  ${zone.label}`, async (o) => {
                    for (const ds of removed) await removeDynamicSection(zone.key, ds, o);
                    for (const ds of added)   await scaffoldDynamicSection(derived, ds, o);
                    o(`\n✓ Sections updated — rebuild ${zone.label} to apply changes`);
                    return 0;
                  });
                }}
                onCancel={() => setManageSections(null)}
                onExit={() => setManageSections(null)}
              />
            )}
          </Box>
        );
      })()}

      {/* Delete confirmation dialog — replaces both */}
      {confirmDelete && (
        <Dialog
          title="Delete zone"
          message={`Permanently delete "${confirmDelete.label}"? This cannot be undone.`}
          onConfirm={() => {
            const { label: zLabel, key: zKey } = confirmDelete;
            setConfirmDelete(null);
            runOp(`Delete zone  ${zKey}`, (o) =>
              deleteZone(zKey, o).then((r) => {
                if (r.exitCode === 0) {
                  addNotification(`"${zLabel}" zone deleted`, "success");
                  invalidateZoneCache();
                  loadZones(true).then(setZones);
                } else {
                  addNotification(`Delete "${zLabel}" failed`, "error");
                }
                return r.exitCode;
              })
            );
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

    </Box>
  );
}
