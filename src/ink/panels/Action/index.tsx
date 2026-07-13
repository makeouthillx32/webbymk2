// src/ink/panels/Action/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Action menu overlay — shown when the user presses Enter on a zone row.
//
// Each action has a keyboard shortcut shown inline.  Disabled actions
// (e.g. Build when there's no Dockerfile) are grayed out and non-selectable.
// ─────────────────────────────────────────────────────────────────────────────

import React              from "react";
import { Box, Text }      from "../../runtimeInk.js";
import type { Zone }      from "../../../config/zones.ts";
import type { Status }    from "../../docker.ts";
import { statusColor }    from "../../components/StatusBadge.tsx";
import { KeyHints }       from "../../components/KeyHint.tsx";
import { useScrollIntoView } from "../../components/ScrollBox.js";


// ── Types ─────────────────────────────────────────────────────────────────────

export interface Action {
  id:       string;
  label:    string;
  desc:     string;
  key:      string;
  disabled: boolean;
}

interface ActionPanelProps {
  zone:     Zone;
  status:   Status;
  selected: number;
}

// ── Action builders ───────────────────────────────────────────────────────────

/** Actions available on a regular deployable zone. */
export function buildActions(zone: Zone): Action[] {
  return [
    { id: "deploy",   label: "Deploy",             desc: "docker compose pull + up",                        key: "d", disabled: false           },
    { id: "pull",     label: "Pull + up",          desc: "docker compose pull + up (no build)",             key: "p", disabled: false           },
    { id: "restart",  label: "Restart",            desc: "docker compose restart",                          key: "r", disabled: false           },
    { id: "build",    label: "Build + deploy",     desc: "build + push + pull + up  (ship)",                    key: "b", disabled: !zone.dockerfile },
    { id: "rebuild",  label: "Rebuild + deploy",   desc: "no-cache build + push + pull + up  (clean)",         key: "R", disabled: !zone.dockerfile },
    { id: "logs",     label: "Logs",               desc: "tail -f container output",                        key: "l", disabled: false           },
    { id: "dev",      label: "Dev mode",           desc: "start dev container  (volume-mount + bun dev)", key: "v", disabled: false           },
    { id: "npm",      label: "Register NPM",       desc: "create proxy host + Let's Encrypt cert",         key: "n", disabled: false           },
    { id: "publish",  label: "Public toggle",      desc: "show / hide in the public Sites & Apps catalog",  key: "P", disabled: false           },
    { id: "sections", label: "Manage sections",    desc: "add / remove dynamic route sections",            key: "s", disabled: false           },
    { id: "doctor",   label: "Fix routing",        desc: "sync proxy route + verify NPM forward target",   key: "f", disabled: false           },
    { id: "delete",   label: "Delete zone",        desc: "remove all files, configs & docker service",     key: "D", disabled: false           },
  ];
}

/**
 * Actions available on the core app (key="unenter").
 * Core is permanent infrastructure — no delete, no NPM, no routing doctor.
 */
export function buildCoreActions(zone: Zone): Action[] {
  return [
    { id: "deploy",  label: "Deploy",             desc: "docker compose pull + up",                        key: "d", disabled: false           },
    { id: "pull",    label: "Pull + up",          desc: "docker compose pull + up (no build)",             key: "p", disabled: false           },
    { id: "restart", label: "Restart",            desc: "docker compose restart",                          key: "r", disabled: false           },
    { id: "build",   label: "Build + deploy",     desc: "build + push + pull + up  (ship)",                    key: "b", disabled: !zone.dockerfile },
    { id: "rebuild", label: "Rebuild + deploy",   desc: "no-cache build + push + pull + up  (clean)",         key: "R", disabled: !zone.dockerfile },
    { id: "logs",    label: "Logs",               desc: "tail -f container output",                        key: "l", disabled: false           },
    { id: "dev",     label: "Dev mode",           desc: "start dev container  (volume-mount + bun dev)", key: "v", disabled: false           },
  ];
}

/**
 * Actions available on the proxy (key="proxy").
 * Proxy is permanent infrastructure — dedicated action set.
 */
export function buildProxyActions(): Action[] {
  return [
    { id: "restart",       label: "Restart",            desc: "reload proxy container",                          key: "r", disabled: false },
    { id: "build-proxy",   label: "Build image",        desc: "docker build + recreate  (Dockerfile changed)",   key: "b", disabled: false },
    { id: "rebuild-proxy", label: "Rebuild (no cache)", desc: "docker build --no-cache + recreate  (clean)",     key: "R", disabled: false },
    { id: "push-agent",    label: "Push agent",         desc: "build agent.js → ghcr.io/…/unaxis-agent:v0",     key: "p", disabled: false },
    { id: "logs",          label: "Logs",               desc: "tail -f proxy container output",                  key: "l", disabled: false },
    { id: "agent-reset",   label: "Reset pairing",      desc: "clear TOFU state — agent re-pairs on next start", key: "a", disabled: false },
    { id: "sync-routes",   label: "Sync routes",        desc: "rebuild routes.json for all deployable zones",    key: "s", disabled: false },
    { id: "audit-npm",     label: "Audit NPM",          desc: "verify all NPM proxy hosts forward correctly",    key: "N", disabled: false },
  ];
}

/** True if this zone entry represents the core monolith, not a deployable zone. */
export function isCoreZone(zone: Zone): boolean {
  return zone.key === "unenter";
}

/** True if this zone entry represents the proxy, not a deployable zone. */
export function isProxyZone(zone: Zone): boolean {
  return zone.key === "proxy";
}

/** Index of the first non-disabled action — used to pre-select the cursor. */
export function firstEnabled(zone: Zone): number {
  const actions = isCoreZone(zone) ? buildCoreActions(zone) : buildActions(zone);
  return actions.findIndex((a) => !a.disabled);
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓",  label: "navigate" },
  { k: "↵",   label: "run"      },
  { k: "esc", label: "back"     },
];

// ── ActionPanelRow Component ───────────────────────────────────────────────────

interface ActionPanelRowProps {
  action: Action;
  focused: boolean;
}

function ActionPanelRow({ action, focused }: ActionPanelRowProps) {
  const ref = React.useRef<any>(null);
  useScrollIntoView(ref, focused);

  return (
    <Box ref={ref} paddingX={1} gap={2}>
      <Text color={focused ? "cyan" : undefined} bold={focused} dimColor={action.disabled}>
        {focused ? "▶" : " "}
      </Text>
      <Box width={3}>
        <Text color={focused ? "cyan" : undefined} bold={focused} dimColor={action.disabled}>
          [{action.key}]
        </Text>
      </Box>
      <Box width={16}>
        <Text color={focused ? "cyan" : undefined} bold={focused} dimColor={action.disabled}>
          {action.label}
        </Text>
      </Box>
      <Text dimColor={!focused || action.disabled}>{action.desc}</Text>
      {action.disabled && <Text dimColor>  (no Dockerfile)</Text>}
    </Box>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ActionPanel({ zone, status, selected }: ActionPanelProps) {
  const actions = isCoreZone(zone)
    ? buildCoreActions(zone)
    : isProxyZone(zone)
      ? buildProxyActions()
      : buildActions(zone);

  return (
    <Box flexDirection="column">

      {/* ── Zone header ─────────────────────────────────────────────────── */}
      <Box paddingX={1} gap={2} marginBottom={1}>
        <Text bold color="cyan">{zone.label}</Text>
        <Text dimColor>·</Text>
        <Text dimColor>{zone.domain}</Text>
        <Text dimColor>·</Text>
        <Text color={statusColor(status)}>{status}</Text>
      </Box>

      {/* ── Action rows ─────────────────────────────────────────────────── */}
      {actions.map((action, i) => {
        const focused = i === selected && !action.disabled;
        return (
          <ActionPanelRow
            key={action.id}
            action={action}
            focused={focused}
          />
        );
      })}

      <KeyHints hints={HINTS} />

    </Box>
  );
}
