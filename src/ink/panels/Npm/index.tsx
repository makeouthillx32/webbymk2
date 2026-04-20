// src/ink/panels/Npm/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// NPM proxy-host panel — lists all Nginx Proxy Manager hosts with their
// SSL and enabled state.  Hosts are loaded on mount and on [R] refresh.
//
// Keyboard (active when rendered):
//   [↑↓/j/k]  navigate
//   [↵]        toggle enabled / disabled
//   [c]        copy selected domain to clipboard
//   [R]        refresh host list
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput }                      from "ink";
import {
  npmGetStatus, npmListHosts,
  type NpmProxyHost, type NpmConnectStatus,
} from "../../npm-api.ts";
import { KeyHints } from "../../components/KeyHint.tsx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NpmPanelProps {
  selected: number;
  onSelect: (n: number) => void;
  onToggle: (host: NpmProxyHost) => void;
  onCopy:   (text: string) => void;
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
  { k: "↑↓", label: "navigate"    },
  { k: "↵",  label: "toggle"      },
  { k: "c",  label: "copy domain" },
  { k: "R",  label: "refresh"     },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function NpmPanel({ selected, onSelect, onToggle, onCopy }: NpmPanelProps) {
  const [hosts,       setHosts]       = useState<NpmProxyHost[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [connectStat, setConnectStat] = useState<NpmConnectStatus>("connected");
  const [error,       setError]       = useState<string | null>(null);
  const [hostCount,   setHostCount]   = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await npmGetStatus();
      setConnectStat(status.status);
      setHostCount(status.hostCount);
      if (status.status === "connected" && status.token) {
        const h = await npmListHosts(status.token);
        setHosts(h);
        if (selected >= h.length) onSelect(Math.max(0, h.length - 1));
      } else {
        setError(status.error ?? "NPM unavailable");
        setHosts([]);
      }
    } catch (e) {
      setError(String(e));
      setHosts([]);
    } finally {
      setLoading(false);
    }
  }, []);   // intentionally stable — only run on mount

  useEffect(() => { load(); }, []);

  // ── Keyboard: toggle + copy + refresh ──────────────────────────────────────
  // index.tsx handles [↑↓/j/k] navigation; we own [↵], [c], [R].
  useInput((input, key) => {
    if (loading || hosts.length === 0) return;

    if (key.return) {
      const host = hosts[selected];
      if (host) onToggle(host);
      setHosts((prev) =>
        prev.map((h, i) => i === selected ? { ...h, enabled: h.enabled ? 0 : 1 } : h)
      );
      return;
    }

    if (input === "c") {
      const domain = hosts[selected]?.domain_names[0];
      if (domain) onCopy(domain);
      return;
    }

    if (input === "R") {
      load();
      return;
    }
  });

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
            <Text dimColor>{hostCount} host{hostCount !== 1 ? "s" : ""}</Text>
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

      {/* ── Host list ───────────────────────────────────────────────────── */}
      {hosts.map((host, i) => {
        const focused = i === selected;
        const enabled = Boolean(host.enabled);
        const domain  = host.domain_names[0] ?? "—";
        const target  = `${host.forward_scheme}://${host.forward_host}:${host.forward_port}`;
        const ssl     = certLabel(host);
        return (
          <Box key={host.id} paddingX={1} gap={2}>
            <Text color={focused ? "cyan" : undefined} bold={focused}>
              {focused ? "▶" : " "}
            </Text>
            <Box width={2}>
              <Text color={enabled ? "green" : "gray"}>{enabled ? "●" : "○"}</Text>
            </Box>
            <Box width={30}>
              <Text
                color={focused ? "cyan" : undefined}
                bold={focused}
                dimColor={!enabled && !focused}
              >
                {domain}
              </Text>
            </Box>
            <Box width={28}>
              <Text dimColor>{target}</Text>
            </Box>
            <Text dimColor>{ssl}</Text>
          </Box>
        );
      })}

      <KeyHints hints={HINTS} />

    </Box>
  );
}
