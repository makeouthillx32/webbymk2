// src/ink/panels/Env/views/stacks/stacks.create.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Add Stack overlay — deploys a Docker Compose stack on the remote environment.
// Mirrors: Portainer stackController.js deployStack() / stacks_create_comp_git.html
//
// POST /stacks/deploy  { name, yaml }
// Agent writes the YAML to disk and runs: docker compose up -d
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import { deployStack } from "../../../../agent-client.ts";
import { Divider }     from "../../../../components/Divider.tsx";
import { KeyHints }    from "../../../../components/KeyHint.tsx";
import { Spinner }     from "../../../../components/Spinner.tsx";
import { TextInput }   from "../../../../components/TextInput.tsx";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";

interface CreateStackViewProps {
  env:    UnaxisEnvironment;
  onDone: (deployed: boolean) => void;
}

type Field = "name" | "yaml" | "confirm" | "deploying" | "done";

const PLACEHOLDER_YAML = [
  "services:",
  "  app:",
  "    image: nginx:latest",
  "    ports:",
  '      - "8080:80"',
  '    restart: unless-stopped',
].join("\n");

export function CreateStackView({ env, onDone }: CreateStackViewProps) {
  const [field,    setField]   = useState<Field>("name");
  const [name,     setName]    = useState("");
  const [yaml,     setYaml]    = useState("");
  const [lines,    setLines]   = useState<string[]>([]);
  const [error,    setError]   = useState<string | null>(null);
  const [success,  setSuccess] = useState(false);

  const busy = field === "deploying";

  useInput((input, key) => {
    if (busy) return;

    if (field === "done") {
      onDone(success);
      return;
    }

    if (key.escape || (input === "q" && field !== "name" && field !== "yaml")) {
      onDone(false);
      return;
    }

    if (field === "yaml") {
      if (key.upArrow) { setField("name"); return; }
    }

    if (field === "confirm") {
      if (key.return || input === "y") { void startDeploy(); return; }
      if (input === "n" || key.escape) { onDone(false); return; }
      if (key.upArrow)                 { setField("yaml"); return; }
    }
  });

  async function startDeploy() {
    setField("deploying");
    setLines([]);
    setError(null);

    const ok = await deployStack(env, name.trim(), yaml.trim(), (line) => {
      setLines((prev) => {
        const next = [...prev, line];
        return next.length > 24 ? next.slice(-24) : next;
      });
    });

    setSuccess(ok);
    if (!ok) setError(`Failed to deploy stack "${name}"`);
    setField("done");
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2}>
        <Text bold color="cyan">Add Stack</Text>
        <Text dimColor>{env.name}</Text>
      </Box>
      <Divider />

      <Box flexDirection="column" gap={1} paddingX={2} marginTop={1}>

        {/* Stack name */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>Stack name</Text></Box>
          {field === "name" ? (
            <TextInput
              width={40}
              placeholder="my-app"
              onSubmit={(v) => { setName(v); setField("yaml"); }}
              onCancel={() => onDone(false)}
            />
          ) : (
            <Box borderStyle="single" borderColor="gray" paddingX={1} width={40}>
              <Text color="white">{name || <Text dimColor>—</Text>}</Text>
            </Box>
          )}
        </Box>

        {/* Compose YAML — single-line input for now (full editor is complex in a TUI) */}
        <Box gap={2} alignItems="flex-start">
          <Box width={14} marginTop={0}><Text dimColor>Compose YAML</Text></Box>
          {field === "yaml" ? (
            <Box flexDirection="column" gap={1}>
              <TextInput
                width={56}
                placeholder="paste single-line yaml (or press Enter for template)"
                onSubmit={(v) => { setYaml(v.trim() || PLACEHOLDER_YAML); setField("confirm"); }}
                onCancel={() => setField("name")}
              />
              <Text dimColor>  Tip: press Enter with empty field to use the nginx template.</Text>
              <Text dimColor>  For complex stacks, edit the file then re-deploy.</Text>
            </Box>
          ) : (
            <Box borderStyle="single" borderColor="gray" paddingX={1} width={56}>
              <Text color={yaml ? "white" : undefined} dimColor={!yaml}>
                {yaml ? `${yaml.slice(0, 52)}…` : "—"}
              </Text>
            </Box>
          )}
        </Box>

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
            <Text bold color="cyan">Ready to deploy</Text>
            <Text dimColor>stack: <Text color="white">{name}</Text></Text>
            <Text dimColor>env:   <Text color="white">{env.name}</Text></Text>
            <Text dimColor>cmd:   docker compose up -d</Text>
            <Box marginTop={1}>
              <Text color="green">Press Enter or [y] to deploy  ·  [n] to cancel</Text>
            </Box>
          </Box>
        )}

        {/* Deploy progress */}
        {(field === "deploying" || field === "done") && (
          <Box flexDirection="column" marginTop={1} gap={0}>
            {field === "deploying" && <Spinner message={`Deploying ${name}…`} />}
            {lines.map((line, i) => (
              <Text key={i} dimColor wrap="truncate">{line}</Text>
            ))}
            {error && <Text color="red">{error}</Text>}
            {field === "done" && !error && (
              <Box marginTop={1}>
                <Text color="green">✓ Stack deployed.  Press any key to continue.</Text>
              </Box>
            )}
            {field === "done" && error && (
              <Box marginTop={1}>
                <Text dimColor>Press any key to go back.</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {!busy && (
        <KeyHints hints={[
          { k: "Enter", label: field === "confirm" ? "deploy" : "next" },
          { k: "esc",   label: "cancel" },
        ]} />
      )}
    </Box>
  );
}
