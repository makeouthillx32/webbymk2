// src/ink/panels/Npm/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// NPM proxy-host panel — lists all Nginx Proxy Manager hosts with their
// SSL and enabled state.  Fully self-contained: owns its own fetch lifecycle,
// polling, local search, and cursor navigation.
//
// Keyboard:
//   [↑↓/j/k]  navigate
//   [/]        search hosts
//   [Esc]      clear search / go back
//   [↵]        toggle enabled / disabled
//   [c]        copy selected domain to clipboard
//   [R]        refresh host list
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Text, useInput }                   from "../../runtimeInk.js";
import {
  npmGetStatus, npmListHosts,
  npmEnableHost, npmDisableHost,
  type NpmProxyHost, type NpmConnectStatus,
} from "../../npm/index.ts";
import { useResource }              from "../../hooks/useResource.ts";
import { KeyHints }                 from "../../components/KeyHint.tsx";
import { fuzzyFilter }              from "../../utils/fuzzy.ts";
import { useTermHeight }            from "../../hooks/useTermWidth.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NpmPanelProps {
  onCopy:   (text: string) => void;
  onGoBack: () => void;
  /** Pre-seeded host list for snapshot-view — skips the initial network fetch. */
  initialHosts?: NpmProxyHost[];
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
    if (days < 0)  return "SSL exp!";
    if (days < 14) return `SSL ${days}d`;
  }
  return "SSL ✓";
}

function certColor(host: NpmProxyHost): string {
  if (!host.certificate_id) return "gray";
  const cert = host.certificate as { expires_on?: string | null } | null | undefined;
  if (cert?.expires_on) {
    const exp  = new Date(cert.expires_on);
    const days = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
    if (days < 0)  return "red";
    if (days < 14) return "yellow";
  }
  return "green";
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

// ── Layout constants ──────────────────────────────────────────────────────────

// Fixed rows used by chrome outside the host list:
//   1  header (NPM · status · count)
//   1  search bar (always shown when hosts exist)
//   1  blank gap
//   1  key hints
//   2  padding buffer
const CHROME_ROWS = 6;

// Column widths
const COL_DOMAIN  = 32;
const COL_TARGET  = 30;
const COL_SSL     = 8;

// ── Hints ─────────────────────────────────────────────────────────────────────

const HINTS = [
  { k: "↑↓/jk", label: "navigate"    },
  { k: "/",     label: "search"      },
  { k: "↵",     label: "toggle"      },
  { k: "c",     label: "copy domain" },
  { k: "R",     label: "refresh"     },
];

// ── Main panel ────────────────────────────────────────────────────────────────

export function NpmPanel({ onCopy, onGoBack, initialHosts }: NpmPanelProps) {
  const termRows = useTermHeight();

  // Connection status display state — set as a side-effect inside fetchHosts.
  const [connectStat, setConnectStat] = useState<NpmConnectStatus>("connected");

  const [selected,     setSelected]     = useState(0);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const searchBuf = useRef("");  // internal buffer while typing

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
    initialData:  initialHosts,
  });

  const visibleHosts = useMemo(
    () => fuzzyFilter(hosts, searchQuery, hostSearchText),
    [hosts, searchQuery],
  );
  const selectedHost = visibleHosts[selected] ?? null;

  // Keep selected in bounds when filtered list shrinks
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, visibleHosts.length - 1)));
  }, [visibleHosts.length]);

  // ── Scroll window ─────────────────────────────────────────────────────────
  const listRows  = Math.max(1, termRows - CHROME_ROWS);
  const scrollOff = Math.max(0, selected - listRows + 1);
  const windowedHosts = visibleHosts.slice(scrollOff, scrollOff + listRows);

  // ── Toggle ────────────────────────────────────────────────────────────────
  const toggleHost = useCallback((host: NpmProxyHost | null) => {
    if (!host) return;
    setHosts((prev) =>
      prev.map((h) => h.id === host.id ? { ...h, enabled: h.enabled ? 0 : 1 } : h)
    );
    (host.enabled ? npmDisableHost(host.id) : npmEnableHost(host.id)).catch(() => {});
  }, [setHosts]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
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
      if (key.escape) {
        if (searchBuf.current) {
          searchBuf.current = "";
          setSearchQuery("");
          setSelected(0);
        } else {
          setSearchActive(false);
        }
        return;
      }
      if (key.backspace || key.delete) {
        searchBuf.current = searchBuf.current.slice(0, -1);
        setSearchQuery(searchBuf.current);
        setSelected(0);
        return;
      }
      // printable chars
      if (input && !key.ctrl && !key.meta) {
        searchBuf.current += input;
        setSearchQuery(searchBuf.current);
        setSelected(0);
      }
      return;
    }

    if (key.escape) {
      if (searchQuery) {
        searchBuf.current = "";
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
  const countLabel = searchQuery
    ? `${visibleHosts.length}/${hosts.length}`
    : `${hosts.length}`;

  return (
    <Box flexDirection="column">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box paddingX={1} gap={2} marginBottom={1}>
        <Text bold color={statusColor(connectStat)}>NPM</Text>
        <Text dimColor>·</Text>
        <Text color={statusColor(connectStat)}>{connectStat}</Text>
        {!loading && connectStat === "connected" && (
          <>
            <Text dimColor>·</Text>
            <Text dimColor>{countLabel} host{hosts.length !== 1 ? "s" : ""}</Text>
          </>
        )}
        {loading && <Text dimColor>  loading…</Text>}
        {error && <Text color="red">  {error}</Text>}
      </Box>

      {/* ── Search bar — always visible when hosts are loaded ───────────── */}
      {hosts.length > 0 && (
        <Box paddingX={1} marginBottom={1} gap={1}>
          <Text dimColor>{searchActive ? "" : "/"}</Text>
          <Text color={searchActive ? "cyan" : "gray"} bold={searchActive}>
            {searchActive
              ? (searchQuery || " ")
              : searchQuery
                ? searchQuery
                : "search…"}
          </Text>
          {searchActive && <Text dimColor>|</Text>}
          {!searchActive && !searchQuery && <Text dimColor>  [/] to filter</Text>}
          {!searchActive && searchQuery && (
            <Text dimColor>  {visibleHosts.length} match{visibleHosts.length !== 1 ? "es" : ""}  [esc] clear</Text>
          )}
        </Box>
      )}

      {/* ── Empty / no-match states ──────────────────────────────────────── */}
      {!loading && hosts.length === 0 && !error && (
        <Box paddingX={2}><Text dimColor>No proxy hosts found.</Text></Box>
      )}
      {hosts.length > 0 && visibleHosts.length === 0 && (
        <Box paddingX={2}><Text dimColor>No hosts match "{searchQuery}"</Text></Box>
      )}

      {/* ── Host list (windowed) ─────────────────────────────────────────── */}
      {windowedHosts.map((host, wi) => {
        const absoluteIdx = wi + scrollOff;
        const focused = absoluteIdx === selected;
        const domain  = host.domain_names[0] ?? "—";
        const target  = `${host.forward_scheme}://${host.forward_host}:${host.forward_port}`;
        const ssl     = certLabel(host);
        const sslCol  = certColor(host);
        const enabled = Boolean(host.enabled);

        return (
          <Box key={host.id} gap={1} paddingX={1}>
            {/* cursor */}
            <Text color={focused ? "cyan" : undefined} bold={focused}>
              {focused ? "›" : " "}
            </Text>

            {/* enabled dot */}
            <Text color={enabled ? (focused ? "cyan" : "green") : "gray"}>
              {enabled ? "●" : "○"}
            </Text>

            {/* domain — truncated */}
            <Box width={COL_DOMAIN}>
              <Text
                color={focused ? "cyan" : undefined}
                bold={focused}
                wrap="truncate"
              >
                {domain}
              </Text>
            </Box>

            {/* forward target */}
            <Box width={COL_TARGET}>
              <Text dimColor={!focused} wrap="truncate">
                {target}
              </Text>
            </Box>

            {/* SSL status */}
            <Box width={COL_SSL}>
              <Text color={focused ? sslCol : "gray"} dimColor={!focused}>
                {ssl}
              </Text>
            </Box>
          </Box>
        );
      })}

      {/* ── Scroll indicator ────────────────────────────────────────────── */}
      {visibleHosts.length > listRows && (
        <Box paddingX={2} marginTop={0}>
          <Text dimColor>
            {scrollOff + 1}–{Math.min(scrollOff + listRows, visibleHosts.length)} of {visibleHosts.length}
            {selected < visibleHosts.length - 1 ? "  ↓ more" : "  (end)"}
          </Text>
        </Box>
      )}

      <KeyHints hints={HINTS} />

    </Box>
  );
}
