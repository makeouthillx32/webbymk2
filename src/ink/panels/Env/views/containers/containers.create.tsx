// src/ink/panels/Env/views/containers/containers.create.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Add Container overlay — multi-step form.
// Mirrors: Portainer createContainerController.js
//
// POST /containers/create  +  POST /containers/{id}/start
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import { createContainer, type ContainerCreateSpec } from "../../../../agent-client.ts";
import { Divider }   from "../../../../components/Divider.tsx";
import { KeyHints }  from "../../../../components/KeyHint.tsx";
import { Spinner }   from "../../../../components/Spinner.tsx";
import { TextInput } from "../../../../components/TextInput.tsx";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";

interface CreateContainerViewProps {
  env:    UnaxisEnvironment;
  onDone: (created: boolean) => void;
}

type Field = "name" | "image" | "ports" | "env" | "restart" | "confirm";

const RESTART_POLICIES = ["no", "always", "unless-stopped", "on-failure"] as const;
type RestartPolicy = typeof RESTART_POLICIES[number];

/** Parse "8080:80" or "8080:80/udp" into port binding object */
function parsePortEntry(raw: string): { container: string; host: string; protocol: "tcp" | "udp" } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const protoMatch = /\/(\w+)$/.exec(trimmed);
  const protocol = protoMatch?.[1] === "udp" ? "udp" : "tcp";
  const withoutProto = trimmed.replace(/\/\w+$/, "");
  const parts = withoutProto.split(":");
  if (parts.length === 2) {
    return { host: parts[0]!, container: parts[1]!, protocol };
  }
  if (parts.length === 1) {
    return { host: parts[0]!, container: parts[0]!, protocol };
  }
  return null;
}

export function CreateContainerView({ env, onDone }: CreateContainerViewProps) {
  const [field,   setField]   = useState<Field>("name");
  const [name,    setName]    = useState("");
  const [image,   setImage]   = useState("");
  const [portsRaw,   setPortsRaw]   = useState("");
  const [envRaw,     setEnvRaw]     = useState("");
  const [restart, setRestart] = useState<RestartPolicy>("unless-stopped");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const restartIdx = RESTART_POLICIES.indexOf(restart);

  useInput((input, key) => {
    if (busy) return;
    if (key.escape || (input === "q" && field !== "name" && field !== "image" && field !== "ports" && field !== "env")) {
      onDone(false);
      return;
    }

    if (field === "restart") {
      if (key.leftArrow)  { setRestart(RESTART_POLICIES[Math.max(0, restartIdx - 1)]!); return; }
      if (key.rightArrow) { setRestart(RESTART_POLICIES[Math.min(RESTART_POLICIES.length - 1, restartIdx + 1)]!); return; }
      if (key.return)     { setField("confirm"); return; }
      if (key.upArrow)    { setField("env"); return; }
    }

    if (field === "confirm") {
      if (key.return || input === "y") { void submit(); return; }
      if (input === "n" || key.escape) { onDone(false); return; }
      if (key.upArrow)                 { setField("restart"); return; }
    }
  });

  async function submit() {
    if (!name.trim())  { setError("Container name is required."); setField("name"); return; }
    if (!image.trim()) { setError("Image is required."); setField("image"); return; }

    // Parse port bindings: "8080:80, 443:443/tcp"
    const ports = portsRaw.split(",")
      .map((p) => parsePortEntry(p))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // Parse env vars: "KEY=value" per line or comma-separated
    const envVars = envRaw.split(/[\n,]/)
      .map((e) => e.trim())
      .filter((e) => e.includes("="));

    const spec: ContainerCreateSpec = {
      name:          name.trim(),
      image:         image.trim(),
      ports,
      env:           envVars,
      labels:        {},
      restartPolicy: restart,
    };

    setBusy(true);
    setError(null);
    const result = await createContainer(env, spec);
    setBusy(false);

    if (result) {
      onDone(true);
    } else {
      setError("Failed to create container — check the agent logs.");
    }
  }

  function ReadonlyField({ value, placeholder }: { value: string; placeholder?: string }) {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1} width={44}>
        <Text color={value ? "white" : undefined} dimColor={!value}>
          {value || (placeholder ?? "—")}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2}>
        <Text bold color="cyan">Add Container</Text>
        <Text dimColor>{env.name}</Text>
      </Box>
      <Divider />

      <Box flexDirection="column" gap={1} paddingX={2} marginTop={1}>

        {/* Name */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>Name</Text></Box>
          {field === "name" ? (
            <TextInput
              width={44}
              placeholder="my-container"
              onSubmit={(v) => { setName(v); setField("image"); }}
              onCancel={() => onDone(false)}
            />
          ) : (
            <ReadonlyField value={name} />
          )}
        </Box>

        {/* Image */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>Image</Text></Box>
          {field === "image" ? (
            <TextInput
              width={44}
              placeholder="nginx:latest"
              onSubmit={(v) => { setImage(v); setField("ports"); }}
              onCancel={() => setField("name")}
            />
          ) : (
            <ReadonlyField value={image} />
          )}
        </Box>

        {/* Ports */}
        <Box gap={2} alignItems="flex-start">
          <Box width={14} marginTop={0}><Text dimColor>Ports</Text></Box>
          {field === "ports" ? (
            <Box flexDirection="column" gap={0}>
              <TextInput
                width={44}
                placeholder="8080:80, 443:443  (host:container)"
                onSubmit={(v) => { setPortsRaw(v); setField("env"); }}
                onCancel={() => setField("image")}
              />
              <Text dimColor>  format: host:container  or  host:container/udp</Text>
            </Box>
          ) : (
            <ReadonlyField value={portsRaw} placeholder="none" />
          )}
        </Box>

        {/* Env vars */}
        <Box gap={2} alignItems="flex-start">
          <Box width={14}><Text dimColor>Env vars</Text></Box>
          {field === "env" ? (
            <Box flexDirection="column" gap={0}>
              <TextInput
                width={44}
                placeholder="KEY=val, ANOTHER=val"
                onSubmit={(v) => { setEnvRaw(v); setField("restart"); }}
                onCancel={() => setField("ports")}
              />
              <Text dimColor>  comma or newline separated KEY=value pairs</Text>
            </Box>
          ) : (
            <ReadonlyField value={envRaw} placeholder="none" />
          )}
        </Box>

        {/* Restart policy */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>Restart</Text></Box>
          <Box gap={1}>
            {RESTART_POLICIES.map((p) => (
              <Box
                key={p}
                borderStyle="single"
                borderColor={p === restart ? "cyan" : "gray"}
                paddingX={1}
              >
                <Text color={p === restart ? "cyan" : undefined} dimColor={p !== restart}>
                  {p}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
        {field === "restart" && (
          <Box paddingLeft={16}><Text dimColor>← → change  ·  Enter next</Text></Box>
        )}

        {/* Confirm */}
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
            <Text dimColor>name:    <Text color="white">{name}</Text></Text>
            <Text dimColor>image:   <Text color="white">{image}</Text></Text>
            {portsRaw && <Text dimColor>ports:   <Text color="white">{portsRaw}</Text></Text>}
            {envRaw   && <Text dimColor>env:     <Text color="white">{envRaw}</Text></Text>}
            <Text dimColor>restart: <Text color="white">{restart}</Text></Text>
            <Box marginTop={1}>
              <Text color="green">Press Enter or [y] to create  ·  [n] to cancel</Text>
            </Box>
          </Box>
        )}

        {busy  && <Spinner message="Creating container…" />}
        {error && <Text color="red">{error}</Text>}
      </Box>

      <KeyHints hints={[
        { k: "Enter", label: field === "confirm" ? "create" : "next" },
        { k: "esc",   label: "cancel" },
      ]} />
    </Box>
  );
}
