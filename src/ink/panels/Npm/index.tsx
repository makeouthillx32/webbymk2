// src/ink/panels/Npm/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// NPM proxy-host panel — lists all Nginx Proxy Manager hosts with their
// SSL and enabled state.  Fully self-contained: owns its own fetch lifecycle,
// polling, and cursor navigation via SelectMenu.
//
// Keyboard:
//   [↑↓/j/k]  navigate (SelectMenu)
//   [↵]        toggle enabled / disabled (SelectMenu onSelect)
//   [c]        copy highlighted domain to clipboard
//   [R]        refresh host list
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput }                   from "ink";
import {
  npmGetStatus, npmListHosts,
  npmEnableHost, npmDisableHost,
  type NpmProxyHost, type NpmConnectStatus,
} from "../../npm-api.ts";
import { useResource }              from "../../hooks/useResource.ts";
import { SelectMenu, type SelectOption } from "../../components/SelectMenu.tsx";
import { KeyHints }                 from "../../components/KeyHint.tsx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NpmPanelProps {
  onCopy:   (text: string) => void;
  onGoBack: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: NpmConnectStatus): string {
  switch (s) {
    case "connected":      return "green";
    case "auth_error":
    case "api_error":
    case "unreachable":    return "red";
    case "no_credentials": return "yellow";
    default:               return "gray";
  }
}

function certLabel(host: NpmProxyHost): string {
  if (!host.certificate_id) return "no SSL";
  const cert = host.certificate as { expires_on?: string | null } | null | undefined;
  if (cert?.expires_on) {
    const exp  = new Date(cert.expires_on);
    const days = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
    if (days < 0)  return "SSL expired";
    if (days < 14) return `SSL exp ${days}d`;
  }
  return "SSL ✓";
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓/jk", label: "navigate"    },
  { k: "↵",     label: "toggle"      },
  { k: "c",     label: "copy domain" },
  { k: "R",     label: "refresh"     },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function NpmPanel({ onCopy, onGoBack }: NpmPanelProps) {

  // Connection status display state — set as a side-effect inside fetchHosts.
  const [connectStat, setConnectStat] = useState<NpmConnectStatus>("connected");

  // Currently highlighted host — updated by SelectMenu's onHighlight.
  // Used by the [c] copy shortcut without needing to own the cursor index.
  const [highlighted, setHighlighted] = useState<NpmProxyHost | null>(null);

  // ── Resource: hosts list ──────────────────────────────────────────────────
  const fetchHosts = useCallback(async (): Promise<NpmProxyHost[]> => {
    const status = await npmGetStatus();
    setConnectStat(status.status);
    if (status.status === "connected" && status.token) {
      return npmListHosts(status.token);
    }
    throw new Error(status.error ?? "NPM unavailable");
  }, []);

  const {
    data: hosts, setData: setHosts,
    loading, error,
    refresh,
  } = useResource<NpmProxyHost>({
    fetch:        fetchHosts,
    pollInterval: 10_000,
  });

  // ── Map hosts → SelectOption ──────────────────────────────────────────────
  // label:  domain name
  // desc:   enabled indicator · forward target · SSL status
  const hostOptions = useMemo<SelectOption[]>(() =>
    hosts.map((h) => ({
      id:    h.id.toString(),
      label: h.domain_names[0] ?? "—",
      desc:  `${h.enabled ? "●" : "○"}  ${h.forward_scheme}://${h.forward_host}:${h.forward_port}  ${certLabel(h)}`,
    })),
    [hosts],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  /** SelectMenu onHighlight — keep `highlighted` in sync with the cursor. */
  const handleHighlight = useCallback((opt: SelectOption) => {
    const host = hosts.find((h) => h.id.toString() === opt.id) ?? null;
    setHighlighted(host);
  }, [hosts]);

  /** SelectMenu onSelect (Enter) — optimistic enable/disable toggle. */
  const handleSelect = useCallback((opt: SelectOption) => {
    const host = hosts.find((h) => h.id.toString() === opt.id);
    if (!host) return;
    setHosts((prev) =>
      prev.map((h) => h.id === host.id ? { ...h, enabled: h.enabled ? 0 : 1 } : h)
    );
    (host.enabled ? npmDisableHost(host.id) : npmEnableHost(host.id)).catch(() => {});
  }, [hosts, setHosts]);

  // ── Extra keyboard shortcuts not handled by SelectMenu ────────────────────
  // [q/←] back, [c] copy highlighted domain, [R] force refresh.
  // These fire alongside SelectMenu's useInput — no conflict since none of
  // these keys are consumed by SelectMenu when searchable=false.
  useInput((input, key) => {
    if (input === "q" || key.leftArrow) { onGoBack(); return; }
    if (input === "c") {
      const domain = highlighted?.domain_names[0];
      if (domain) onCopy(domain);
      return;
    }
    if (input === "R") {
      refresh();
      return;
    }
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column">

      {/* ── Connection header ────────────────────────────────────────────── */}
      <Box paddingX={1} gap={2} marginBottom={1}>
        <Text bold color={statusColor(connectStat)}>NPM</Text>
        <Text dimColor>·</Text>
        <Text color={statusColor(connectStat)}>{connectStat}</Text>
        {!loading && connectStat === "connected" && (
          <>
            <Text dimColor>·</Text>
            <Text dimColor>{hosts.length} host{hosts.length !== 1 ? "s" : ""}</Text>
          </>
        )}
        {loading && <Text dimColor>  loading…</Text>}
      </Box>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <Box paddingX={2} marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && hosts.length === 0 && !error && (
        <Box paddingX={2}><Text dimColor>No proxy hosts found.</Text></Box>
      )}

      {/* ── Host list via SelectMenu ─────────────────────────────────────── */}
      {hosts.length > 0 && (
        <SelectMenu
          options={hostOptions}
          onSelect={handleSelect}
          onHighlight={handleHighlight}
          searchable={false}
        />
      )}

      <KeyHints hints={HINTS} />

    </Box>
  );
}
