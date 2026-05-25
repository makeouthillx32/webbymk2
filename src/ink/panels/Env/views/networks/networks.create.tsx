// src/ink/panels/Env/views/networks/networks.create.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Add Network overlay.
// Mirrors: Portainer networkController.js createNetwork() + createNetwork.html
//
// POST /networks/create  →  { Name, Driver, Subnet, Gateway, Internal, Attachable }
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import { createNetwork, type NetworkCreateSpec } from "../../../../agent-client.ts";
import { Divider }    from "../../../../components/Divider.tsx";
import { KeyHints }   from "../../../../components/KeyHint.tsx";
import { Spinner }    from "../../../../components/Spinner.tsx";
import { TextInput }  from "../../../../components/TextInput.tsx";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";

interface CreateNetworkViewProps {
  env:    UnaxisEnvironment;
  onDone: (created: boolean) => void;
}

type Field = "name" | "driver" | "subnet" | "gateway" | "options" | "confirm";

const DRIVERS = ["bridge", "overlay", "macvlan", "host", "none"] as const;

export function CreateNetworkView({ env, onDone }: CreateNetworkViewProps) {
  const [field,       setField]      = useState<Field>("name");
  const [name,        setName]       = useState("");
  const [driver,      setDriver]     = useState("bridge");
  const [subnet,      setSubnet]     = useState("");
  const [gateway,     setGateway]    = useState("");
  const [internal,    setInternal]   = useState(false);
  const [attachable,  setAttachable] = useState(false);
  const [enableIpv6,  setEnableIpv6] = useState(false);
  const [busy,        setBusy]       = useState(false);
  const [error,       setError]      = useState<string | null>(null);

  const driverIdx = DRIVERS.indexOf(driver as typeof DRIVERS[number]);

  useInput((input, key) => {
    if (busy) return;
    if (key.escape || (input === "q" && field !== "name" && field !== "subnet" && field !== "gateway")) {
      onDone(false);
      return;
    }

    if (field === "driver") {
      if (key.leftArrow)  { setDriver(DRIVERS[Math.max(0, driverIdx - 1)]!); return; }
      if (key.rightArrow) { setDriver(DRIVERS[Math.min(DRIVERS.length - 1, driverIdx + 1)]!); return; }
      if (key.return)     { setField("subnet"); return; }
    }

    if (field === "options") {
      if (input === "i") { setInternal((v) => !v); return; }
      if (input === "a") { setAttachable((v) => !v); return; }
      if (input === "6") { setEnableIpv6((v) => !v); return; }
      if (key.return)    { setField("confirm"); return; }
      if (key.upArrow)   { setField("gateway"); return; }
    }

    if (field === "confirm") {
      if (key.return || input === "y") { void submit(); return; }
      if (input === "n" || key.escape) { onDone(false); return; }
      if (key.upArrow) { setField("options"); return; }
    }
  });

  async function submit() {
    if (!name.trim()) { setError("Network name is required."); setField("name"); return; }
    setBusy(true);
    setError(null);
    const spec: NetworkCreateSpec = {
      name:       name.trim(),
      driver,
      subnet:     subnet.trim() || undefined,
      gateway:    gateway.trim() || undefined,
      internal,
      attachable,
      ipv6:       enableIpv6,
    };
    const result = await createNetwork(env, spec);
    setBusy(false);
    if (result) {
      onDone(true);
    } else {
      setError("Failed to create network — check the agent logs.");
    }
  }

  function CheckRow({ label, checked }: { label: string; checked: boolean }) {
    return (
      <Box gap={2}>
        <Text color={checked ? "cyan" : "gray"}>{checked ? "■" : "□"}</Text>
        <Text dimColor={!checked} color={checked ? "white" : undefined}>{label}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2}>
        <Text bold color="cyan">Add Network</Text>
        <Text dimColor>{env.name}</Text>
      </Box>
      <Divider />

      <Box flexDirection="column" gap={1} paddingX={2} marginTop={1}>

        {/* Name */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>Name</Text></Box>
          {field === "name" ? (
            <TextInput
              width={40}
              placeholder="my-network"
              onSubmit={(v) => { setName(v); setField("driver"); }}
              onCancel={() => onDone(false)}
            />
          ) : (
            <Box borderStyle="single" borderColor="gray" paddingX={1} width={40}>
              <Text color="white">{name || <Text dimColor>—</Text>}</Text>
            </Box>
          )}
        </Box>

        {/* Driver */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>Driver</Text></Box>
          <Box gap={1}>
            {DRIVERS.map((d) => (
              <Box
                key={d}
                borderStyle="single"
                borderColor={d === driver ? "cyan" : "gray"}
                paddingX={1}
              >
                <Text color={d === driver ? "cyan" : undefined} dimColor={d !== driver}>
                  {d}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
        {field === "driver" && (
          <Box paddingLeft={16}><Text dimColor>← → change  ·  Enter next</Text></Box>
        )}

        {/* Subnet */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>IPv4 Subnet</Text></Box>
          {field === "subnet" ? (
            <TextInput
              width={28}
              placeholder="192.168.1.0/24  (optional)"
              onSubmit={(v) => { setSubnet(v); setField("gateway"); }}
              onCancel={() => setField("driver")}
            />
          ) : (
            <Box borderStyle="single" borderColor="gray" paddingX={1} width={28}>
              <Text color={subnet ? "white" : undefined} dimColor={!subnet}>
                {subnet || "optional"}
              </Text>
            </Box>
          )}
        </Box>

        {/* Gateway */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>IPv4 Gateway</Text></Box>
          {field === "gateway" ? (
            <TextInput
              width={28}
              placeholder="192.168.1.1  (optional)"
              onSubmit={(v) => { setGateway(v); setField("options"); }}
              onCancel={() => setField("subnet")}
            />
          ) : (
            <Box borderStyle="single" borderColor="gray" paddingX={1} width={28}>
              <Text color={gateway ? "white" : undefined} dimColor={!gateway}>
                {gateway || "optional"}
              </Text>
            </Box>
          )}
        </Box>

        {/* Options toggles */}
        {(field === "options" || field === "confirm") && (
          <Box flexDirection="column" gap={0} paddingLeft={16} marginTop={1}>
            <CheckRow label="Internal (isolated)"      checked={internal} />
            <CheckRow label="Attachable"               checked={attachable} />
            <CheckRow label="Enable IPv6"              checked={enableIpv6} />
            {field === "options" && (
              <Box marginTop={1}>
                <Text dimColor>[i] internal · [a] attachable · [6] ipv6 · Enter next</Text>
              </Box>
            )}
          </Box>
        )}

        {/* Summary / confirm */}
        {field === "confirm" && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={2}
            paddingY={1}
            marginTop={1}
          >
            <Text bold color="cyan">Ready to create</Text>
            <Text dimColor>name:       <Text color="white">{name}</Text></Text>
            <Text dimColor>driver:     <Text color="white">{driver}</Text></Text>
            {subnet  && <Text dimColor>subnet:     <Text color="white">{subnet}</Text></Text>}
            {gateway && <Text dimColor>gateway:    <Text color="white">{gateway}</Text></Text>}
            {internal   && <Text dimColor>internal:   <Text color="white">yes</Text></Text>}
            {attachable  && <Text dimColor>attachable: <Text color="white">yes</Text></Text>}
            {enableIpv6  && <Text dimColor>ipv6:       <Text color="white">yes</Text></Text>}
            <Box marginTop={1}>
              <Text color="green">Press Enter or [y] to create  ·  [n] to cancel</Text>
            </Box>
          </Box>
        )}

        {busy  && <Spinner message="Creating network…" />}
        {error && <Text color="red">{error}</Text>}
      </Box>

      <KeyHints hints={[
        { k: "Enter", label: field === "confirm" ? "create" : "next" },
        { k: "esc",   label: "cancel" },
      ]} />
    </Box>
  );
}
