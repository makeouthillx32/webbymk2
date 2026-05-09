// src/ink/panels/Npm/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// NPM proxy-host panel — lists all Nginx Proxy Manager hosts with their
// SSL and enabled state.  Fully self-contained: owns its own fetch lifecycle,
// polling, local search, and cursor navigation.
//
// Keyboard:
//   [↑↓/j/k]  navigate
//   [/]        search hosts
//   [↵]        toggle enabled / disabled
//   [c]        copy selected domain to clipboard
//   [R]        refresh host list
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, useInput }                   from "ink";
import {
  npmGetStatus, npmListHosts,
  npmEnableHost, npmDisableHost,
  type NpmProxyHost, type NpmConnectStatus,
} from "../../npm-api.ts";
import { useResource }              from "../../hooks/useResource.ts";
import { KeyHints }                 from "../../components/KeyHint.tsx";
import { SearchInput }              from "../../components/SearchBox.tsx";
import { fuzzyFilter }              from "../../utils/fuzzy.ts";

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

function hostSearchText(host: NpmProxyHost): string {
  return [
    ...host.domain_names,
    host.forward_scheme,
    host.forward_host,
    String(host.forward_port),
    certLabel(host),
    host.enabled ? "enabled active on" : "disabled inactive off",
    host.certificate?.provider ?? "",
    host.certificate?.nice_name ?? "",
    ...(host.certificate?.domain_names ?? []),
  ].join(" ");
}

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓/jk", label: "navigate"    },
  { k: "/",     label: "search"      },
  { k: "↵",     label: "toggle"      },
  { k: "c",     label: "copy domain" },
  { k: "R",     label: "refresh"     },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function NpmPanel({ onCopy, onGoBack }: NpmPanelProps) {

  // Connection status display state — set as a side-effect inside fetchHosts.
  const [connectStat, setConnectStat] = useState<NpmConnectStatus>("connected");

  const [selected,     setSelected]     = useState(0);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searchActive, setSearchActive] = useState(false);

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

  const visibleHosts = useMemo(
    () => fuzzyFilter(hosts, searchQuery, hostSearchText),
    [hosts, searchQuery],
  );
  const selectedHost = visibleHosts[selected] ?? null;

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
    setSelected((s) => Math.min(s, Math.max(0, visibleHosts.length - 1)));
  }, [visibleHosts.length]);

  const toggleHost = useCallback((host: NpmProxyHost | null) => {
    if (!host) return;
    setHosts((prev) =>
      prev.map((h) => h.id === host.id ? { ...h, enabled: h.enabled ? 0 : 1 } : h)
    );
    (host.enabled ? npmDisableHost(host.id) : npmEnableHost(host.id)).catch(() => {});
  }, [setHosts]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // Search focus lets SearchInput own printable characters while this panel
  // keeps arrow navigation and Enter on the filtered result list.
  useInput((input, key) => {
    if (searchActive) {
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
        return;
      }
      if (key.downArrow) {
        setSelected((s) => Math.min(Math.max(0, visibleHosts.length - 1), s + 1));
        return;
      }
      if (key.return) {
        toggleHost(selectedHost);
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
    if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(Math.max(0, visibleHosts.length - 1), s + 1));
      return;
    }
    if (key.return) {
      toggleHost(selectedHost);
      return;
    }
    if (input === "q" || key.leftArrow) { onGoBack(); return; }
    if (input === "c") {
      const domain = selectedHost?.domain_names[0];
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
            <Text dimColor>
              {searchQuery
                ? `${visibleHosts.length}/${hosts.length} host${hosts.length !== 1 ? "s" : ""}`
                : `${hosts.length} host${hosts.length !== 1 ? "s" : ""}`}
            </Text>
          </>
        )}
        {loading && <Text dimColor>  loading…</Text>}
      </Box>

      {hosts.length > 0 && (
        <Box paddingX={1} marginBottom={1} gap={2}>
          <SearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            onCancel={cancelSearch}
            placeholder="Search proxy hosts"
            prefix="/"
            width={42}
            active={searchActive}
          />
          <Text dimColor>
            {searchActive
              ? "[esc] clear"
              : searchQuery
                ? `${visibleHosts.length}/${hosts.length} matches`
                : "[/] search"}
          </Text>
        </Box>
      )}

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

      {hosts.length > 0 && visibleHosts.length === 0 && (
        <Box paddingX={2}><Text dimColor>{`No proxy hosts match "${searchQuery}"`}</Text></Box>
      )}

      {visibleHosts.length > 0 && (
        visibleHosts.map((host, i) => {
          const focused = i === selected;
          return (
            <Box key={host.id} gap={2} paddingX={1}>
              <Text color={focused ? "cyan" : undefined} bold={focused}>
                {focused ? "›" : " "}
              </Text>
              <Box width={28}>
                <Text color={focused ? "cyan" : undefined} bold={focused}>
                  {host.domain_names[0] ?? "—"}
                </Text>
              </Box>
              <Text dimColor={!focused} color={focused ? "gray" : undefined}>
                {host.enabled ? "●" : "○"}  {host.forward_scheme}://{host.forward_host}:{host.forward_port}  {certLabel(host)}
              </Text>
            </Box>
          );
        })
      )}

      <KeyHints hints={HINTS} />

    </Box>
  );
}
