// src/ink/panels/Action/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Action menu overlay — shown when the user presses Enter on a zone row.
//
// Each action has a keyboard shortcut shown inline.  Disabled actions
// (e.g. Build when there's no Dockerfile) are grayed out and non-selectable.
// ─────────────────────────────────────────────────────────────────────────────

import React              from "react";
import { Box, Text }      from "ink";
import type { Zone }      from "../../../config/zones.ts";
import type { Status }    from "../../docker.ts";
import { statusColor }    from "../../components/StatusBadge.tsx";
import { KeyHints }       from "../../components/KeyHint.tsx";

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

// ── Action builder ────────────────────────────────────────────────────────────

export function buildActions(zone: Zone): Action[] {
  return [
    { id: "deploy",  label: "Deploy",       desc: "git pull → docker compose up",              key: "d", disabled: false           },
    { id: "pull",    label: "Pull + up",    desc: "docker compose pull + up (no build)",        key: "p", disabled: false           },
    { id: "restart", label: "Restart",      desc: "docker compose restart",                     key: "r", disabled: false           },
    { id: "build",   label: "Build + push", desc: "docker build + push to GHCR",               key: "b", disabled: !zone.dockerfile },
    { id: "rebuild", label: "Rebuild (no cache)", desc: "docker build --no-cache + push (clean)", key: "R", disabled: !zone.dockerfile },
    { id: "logs",    label: "Logs",         desc: "tail -f container output",                   key: "l", disabled: false           },
    { id: "npm",     label: "Register NPM", desc: "create proxy host + Let's Encrypt cert",     key: "n", disabled: false           },
    { id: "doctor",  label: "Fix compose",  desc: "backfill image: field + recreate proxy (fix routing)", key: "f", disabled: false           },
    { id: "delete",  label: "Delete zone",  desc: "remove all files, configs & docker service", key: "D", disabled: false           },
  ];
}

/** Index of the first non-disabled action — used to pre-select the cursor. */
export function firstEnabled(zone: Zone): number {
  return buildActions(zone).findIndex((a) => !a.disabled);
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓",  label: "navigate" },
  { k: "↵",   label: "run"      },
  { k: "esc", label: "back"     },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function ActionPanel({ zone, status, selected }: ActionPanelProps) {
  const actions = buildActions(zone);

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
          <Box key={action.id} paddingX={1} gap={2}>
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
      })}

      <KeyHints hints={HINTS} />

    </Box>
  );
}
