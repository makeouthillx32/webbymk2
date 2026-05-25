// src/ink/panels/Env/views/volumes/volumes.create.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Add Volume overlay.
// Mirrors: Portainer volumeController.js createVolume() + createVolume.html
//
// POST /volumes/create  →  { Name, Driver }
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import { createVolume } from "../../../../agent-client.ts";
import { Divider }      from "../../../../components/Divider.tsx";
import { KeyHints }     from "../../../../components/KeyHint.tsx";
import { Spinner }      from "../../../../components/Spinner.tsx";
import { TextInput }    from "../../../../components/TextInput.tsx";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";

interface CreateVolumeViewProps {
  env:    UnaxisEnvironment;
  onDone: (created: boolean) => void;
}

type Field = "name" | "driver" | "confirm";

const DRIVERS = ["local", "overlay", "nfs", "cifs", "tmpfs"] as const;

export function CreateVolumeView({ env, onDone }: CreateVolumeViewProps) {
  const [field,   setField]   = useState<Field>("name");
  const [name,    setName]    = useState("");
  const [driver,  setDriver]  = useState("local");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const driverIdx = DRIVERS.indexOf(driver as typeof DRIVERS[number]);

  useInput((input, key) => {
    if (busy) return;
    if (key.escape || (input === "q" && field !== "name" && field !== "driver")) {
      onDone(false);
      return;
    }

    if (field === "driver") {
      if (key.leftArrow)  { setDriver(DRIVERS[Math.max(0, driverIdx - 1)]!); return; }
      if (key.rightArrow) { setDriver(DRIVERS[Math.min(DRIVERS.length - 1, driverIdx + 1)]!); return; }
      if (key.return) { setField("confirm"); return; }
    }

    if (field === "confirm") {
      if (key.return || input === "y") {
        void submit();
        return;
      }
      if (input === "n" || key.escape) {
        onDone(false);
        return;
      }
      if (key.upArrow)    { setField("driver"); return; }
    }
  });

  async function submit() {
    if (!name.trim()) { setError("Volume name is required."); setField("name"); return; }
    setBusy(true);
    setError(null);
    const result = await createVolume(env, name.trim(), driver);
    setBusy(false);
    if (result) {
      onDone(true);
    } else {
      setError("Failed to create volume — check the agent logs.");
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2}>
        <Text bold color="cyan">Add Volume</Text>
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
              placeholder="my-volume"
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
          <Box paddingLeft={16}>
            <Text dimColor>← → change  ·  Enter next</Text>
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
            <Text dimColor>name:   <Text color="white">{name}</Text></Text>
            <Text dimColor>driver: <Text color="white">{driver}</Text></Text>
            <Box marginTop={1}>
              <Text color="green">Press Enter or [y] to create  ·  [n] to cancel</Text>
            </Box>
          </Box>
        )}

        {busy  && <Spinner message="Creating volume…" />}
        {error && <Text color="red">{error}</Text>}
      </Box>

      <KeyHints hints={[
        { k: "Enter", label: field === "confirm" ? "create" : "next" },
        { k: "esc",   label: "cancel" },
      ]} />
    </Box>
  );
}
