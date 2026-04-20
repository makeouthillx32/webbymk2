// tui/screens/WelcomeScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Splash screen shown on startup.
//
// The routing chain diagram is the centrepiece — it teaches the user exactly
// how a public HTTP request travels from the internet through Nginx Proxy
// Manager → the nginx reverse-proxy → each Next.js 15 zone container.
// This is the "gift to humanity": making multi-zone hosting legible.
//
// Auto-advances to the dashboard after 3 s, or on any keypress.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { Box, Text }                  from "ink";
import { ZONES, PROXY }               from "../../config/zones.ts";
import { STACK_HOST, NPM_HOST }       from "../../config/stack.ts";
import { type Status }                from "../docker.ts";
import { Dot }                        from "../ui/primitives.tsx";

type StatusMap = Record<string, Status>;

export interface WelcomeScreenProps {
  zoneStatuses: StatusMap;
  proxyStatus:  Status;
  countdown:    number;    // seconds until auto-advance (0 = now)
}

export function WelcomeScreen({ zoneStatuses, proxyStatus, countdown }: WelcomeScreenProps) {
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 550);
    return () => clearInterval(id);
  }, []);

  const allLive  = proxyStatus === "running" && ZONES.every((z) => zoneStatuses[z.key] === "running");
  const anyUp    = proxyStatus === "running" || ZONES.some((z) => (zoneStatuses[z.key] ?? "missing") !== "missing");

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      width={76}
    >

      {/* ── Logo + title ──────────────────────────────────────────────────────── */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text bold color="cyan">{"◈   u n t · i n k"}</Text>
      </Box>
      <Box justifyContent="center" marginBottom={1}>
        <Text color="gray">welcome to </Text>
        <Text bold color="white">unenter.live</Text>
      </Box>

      {/* ── Core live/offline pill ────────────────────────────────────────────── */}
      <Box justifyContent="center" gap={2} marginBottom={2}>
        <Text color={allLive ? "green" : anyUp ? "yellow" : "red"}>
          {allLive ? "● core is live" : anyUp ? "◑ starting" : "○ offline"}
        </Text>
        <Text dimColor>|</Text>
        <Box gap={1}>
          <Text dimColor>proxy</Text>
          <Dot status={proxyStatus} />
        </Box>
        {ZONES.map((z) => (
          <Box key={z.key} gap={1}>
            <Text dimColor>{z.key}</Text>
            <Dot status={zoneStatuses[z.key] ?? "missing"} />
          </Box>
        ))}
      </Box>

      {/* ── Routing chain ─────────────────────────────────────────────────────── */}
      {/* This diagram shows how internet traffic reaches each zone container.   */}
      {/* NPM (Nginx Proxy Manager) on L0VE handles SSL termination.             */}
      {/* The nginx proxy on P0W3R routes by Host header to each Next.js zone.  */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={2}
        paddingY={0}
        marginBottom={2}
      >
        <Box marginTop={0}>
          <Text dimColor>  how a request reaches your app</Text>
        </Box>
        <Text> </Text>

        {/* internet → NPM */}
        <Box>
          <Text color="blue">  internet</Text>
          <Text color="gray"> ──▶ </Text>
          <Text bold color="cyan">◈ NPM</Text>
          <Text dimColor>
            {" · " + NPM_HOST.label + " · " + NPM_HOST.ip + ":" + NPM_HOST.port}
          </Text>
          <Text color="green">{"  · SSL ✓ · Let's Encrypt"}</Text>
        </Box>

        {/* connector line */}
        <Box>
          <Text dimColor>{"           "}</Text>
          <Text color="gray">{"      │"}</Text>
          <Text dimColor>{"  terminates TLS, forwards to stack"}</Text>
        </Box>

        {/* NPM → proxy */}
        <Box>
          <Text dimColor>{"           "}</Text>
          <Text color="gray">{"      ▼  "}</Text>
          <Text bold color="cyan">◈ proxy</Text>
          <Text dimColor>
            {" · " + STACK_HOST.label + " · :" + PROXY.port}
          </Text>
          <Text color="yellow">{"  · Host-header routing"}</Text>
        </Box>

        {/* branch lines */}
        <Box>
          <Text dimColor>{"           "}</Text>
          <Text color="gray">{"      ┌──"}</Text>
          {ZONES.map((z, i) => (
            <Text key={z.key} color="gray">
              {i < ZONES.length - 1 ? "──────┬" : "──────┐"}
            </Text>
          ))}
        </Box>

        {/* zone status dots */}
        <Box>
          <Text dimColor>{"           "}</Text>
          <Text color="gray">{"      ▼   "}</Text>
          {ZONES.map((z, i) => {
            const s = zoneStatuses[z.key] ?? "missing";
            return (
              <Box key={z.key}>
                <Dot status={s} />
                <Text dimColor>
                  {" " + z.key + (i < ZONES.length - 1 ? "     " : "")}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Text> </Text>

        {/* footer caption */}
        <Box>
          <Text dimColor>
            {"  Next.js 15 multi-zone · independent deploys · shared domain"}
          </Text>
        </Box>
        <Text> </Text>
      </Box>

      {/* ── Enter prompt ──────────────────────────────────────────────────────── */}
      <Box justifyContent="center" gap={1}>
        <Text color={blink ? "cyan" : "gray"}>▶</Text>
        <Text dimColor>press any key to manage</Text>
        {countdown > 0 && (
          <Text dimColor>{"  · auto in " + countdown + "s"}</Text>
        )}
      </Box>

      <Text> </Text>
    </Box>
  );
}
