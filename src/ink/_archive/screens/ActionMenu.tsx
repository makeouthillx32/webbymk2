// tui/screens/ActionMenu.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Contextual action menu overlay for a selected zone.
//
// Displayed when the user presses Enter on a zone in the dashboard.
// Navigate with ↑↓, confirm with Enter, dismiss with Esc.
//
// Replaces the need to memorise hotkeys — every action has a description
// so operators and newcomers alike know exactly what each option does.
// ─────────────────────────────────────────────────────────────────────────────

import React    from "react";
import { Box, Text } from "ink";
import { type Zone } from "../../config/zones.ts";
import { type Status }    from "../docker.ts";
import { Dot, Rule }      from "../ui/primitives.tsx";
import { ListItem }       from "../ui/ListItem.tsx";

// ── Action definition ─────────────────────────────────────────────────────────

export interface ZoneAction {
  id:          string;
  key:         string;
  label:       string;
  description: string;
  disabled?:   boolean;
}

/**
 * Build the ordered list of available actions for a zone.
 * Disabled actions are shown dimmed and cannot be selected.
 */
export function buildActions(zone: Zone): ZoneAction[] {
  return [
    {
      id:          "deploy",
      key:         "d",
      label:       "Deploy",
      description: "build → push to GHCR → pull → up  (full cycle)",
      disabled:    !zone.dockerfile,
    },
    {
      id:          "pull",
      key:         "p",
      label:       "Pull + up",
      description: "pull latest image from GHCR and restart",
    },
    {
      id:          "restart",
      key:         "r",
      label:       "Restart",
      description: "restart container without pulling new image",
    },
    {
      id:          "build",
      key:         "b",
      label:       "Build only",
      description: "build image + push to GHCR, skip deploy",
      disabled:    !zone.dockerfile,
    },
    {
      id:          "logs",
      key:         "l",
      label:       "Logs",
      description: "live log tail  (q / esc to close)",
    },
    {
      id:          "npm",
      key:         "n",
      label:       "NPM register",
      description: "add " + zone.domain + " to Nginx Proxy Manager",
    },
  ];
}

/**
 * Return the index of the first non-disabled action.
 * Used when the menu is first opened.
 */
export function firstEnabled(zone: Zone): number {
  const actions = buildActions(zone);
  const i = actions.findIndex((a) => !a.disabled);
  return i >= 0 ? i : 0;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface ActionMenuProps {
  zone:     Zone;
  status:   Status;
  selected: number;
}

export function ActionMenu({ zone, status, selected }: ActionMenuProps) {
  const actions = buildActions(zone);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      width={76}
    >

      {/* ── Zone header ───────────────────────────────────────────────────── */}
      <Box gap={2}>
        <Text bold color="cyan">{zone.label}</Text>
        <Dot status={status} />
        <Text dimColor>{zone.domain}</Text>
        <Text dimColor>  {zone.container}</Text>
      </Box>

      <Rule />

      {/* ── Action list ───────────────────────────────────────────────────── */}
      <Box flexDirection="column">
        {actions.map((action, i) => {
          const focused = selected === i && !action.disabled;
          return (
            <ListItem
              key={action.id}
              focused={focused}
              disabled={action.disabled}
            >
              <Text
                color={focused ? "cyan" : action.disabled ? undefined : "cyan"}
                dimColor={action.disabled}
                bold={focused}
              >
                [{action.key}]
              </Text>
              <Text
                bold={focused}
                dimColor={action.disabled}
              >
                {"  " + action.label.padEnd(14)}
              </Text>
              <Text dimColor>
                {action.description}
              </Text>
            </ListItem>
          );
        })}
      </Box>

      <Rule />

      {/* ── Hint bar ──────────────────────────────────────────────────────── */}
      <Box gap={2}>
        <Text dimColor>
          <Text color="cyan">[↑↓]</Text>{" "}navigate
        </Text>
        <Text dimColor>·</Text>
        <Text dimColor>
          <Text color="cyan">[↵]</Text>{" "}confirm
        </Text>
        <Text dimColor>·</Text>
        <Text dimColor>
          <Text color="cyan">[esc]</Text>{" "}back
        </Text>
      </Box>

    </Box>
  );
}
