// src/screens/AddEnvironmentScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Add Environment Wizard — Portainer-style new environment setup.
//
// Step 1 — Name + Address
//   Enter a display name (e.g. "L0VE") and the agent URL (host:port).
//
// Step 2 — Deploy Agent
//   Shows the docker run command to paste on the remote machine.
//   [w] toggles Linux / Windows command variant.
//   [p] pings the agent to test the connection.
//   Shows Portainer-style success / failure feedback inline.
//   [Enter] saves the environment to Supabase whether ping passed or not.
//
// Navigation:
//   Tab / Enter  — advance
//   Esc / q      — back one step / cancel
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from "react";
import { Box, Text, useInput }          from "ink";

import { SearchInput }    from "../ink/components/SearchBox.jsx";
import { Divider }        from "../ink/components/Divider.jsx";
import { Spinner }        from "../ink/components/Spinner.jsx";
import { AGENT_FULL }     from "../ink/agent-ops.ts";
import { pingAgent }      from "../ink/agent-client.ts";
import {
  createEnvironment,
  type UnaxisEnvironment,
} from "../ink/environment-store.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = "details" | "deploy" | "saving";
type PingState  = "idle" | "pinging" | "success" | "failure";

export interface AddEnvironmentScreenProps {
  onDone:   () => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deployCmd(port: number): string {
  return (
    `docker run -d \\\n` +
    `  --name unaxis_agent \\\n` +
    `  --restart unless-stopped \\\n` +
    `  -p ${port}:8888 \\\n` +
    `  -v /var/run/docker.sock:/var/run/docker.sock \\\n` +
    `  -v unaxis_agent_data:/data \\\n` +
    `  --group-add $(stat -c '%g' /var/run/docker.sock) \\\n` +
    `  ${AGENT_FULL}`
  );
}

function deployCmdWindows(port: number): string {
  return (
    `docker run -d \`\n` +
    `  --name unaxis_agent \`\n` +
    `  --restart unless-stopped \`\n` +
    `  -p ${port}:8888 \`\n` +
    `  -v //./pipe/docker_engine://./pipe/docker_engine \`\n` +
    `  -v unaxis_agent_data:/data \`\n` +
    `  ${AGENT_FULL}`
  );
}

function parseAgentUrl(raw: string): { url: string; port: number } {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return { url: "", port: 8888 };

  const withScheme = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
  try {
    const u    = new URL(withScheme);
    const port = u.port ? parseInt(u.port, 10) : 8888;
    // Ensure port is in the URL
    if (!u.port) u.port = String(port);
    return { url: u.toString().replace(/\/$/, ""), port };
  } catch {
    // Fallback — couldn't parse
    const parts = trimmed.split(":");
    const port  = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : 8888;
    return { url: `http://${trimmed.includes(":") ? trimmed : `${trimmed}:${port}`}`, port };
  }
}

// ── Step 1 — Name + Address ───────────────────────────────────────────────────

function DetailsStep({
  name, agentUrl,
  onChangeName, onChangeUrl,
  onNext, onCancel,
}: {
  name:         string;
  agentUrl:     string;
  onChangeName: (v: string) => void;
  onChangeUrl:  (v: string) => void;
  onNext:       () => void;
  onCancel:     () => void;
}) {
  const [field, setField] = useState<"name" | "url">("name");

  useInput((input, key) => {
    if (input === "q" || key.escape) { onCancel(); return; }
    if (key.tab) {
      setField((f) => f === "name" ? "url" : "name");
      return;
    }
    if (key.return) {
      if (field === "name" && name.trim()) { setField("url"); return; }
      if (field === "url"  && agentUrl.trim()) { onNext(); return; }
    }
    if (key.upArrow)   { setField("name"); return; }
    if (key.downArrow) { setField("url");  return; }
  });

  const canAdvance = name.trim() && agentUrl.trim();

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2} paddingX={1}>
        <Text bold color="cyan">New Environment</Text>
        <Text dimColor>step 1 of 2</Text>
      </Box>
      <Divider />

      <Box flexDirection="column" gap={1} paddingX={2}>

        {/* Name field */}
        <Box flexDirection="column" gap={0}>
          <Text color={field === "name" ? "cyan" : "white"} bold={field === "name"}>
            {field === "name" ? "▶ " : "  "}Name
          </Text>
          <Box paddingLeft={2}>
            <SearchInput
              value={name}
              onChange={onChangeName}
              placeholder="e.g. L0VE"
              focus={field === "name"}
            />
          </Box>
        </Box>

        {/* Agent URL field */}
        <Box flexDirection="column" gap={0} marginTop={1}>
          <Text color={field === "url" ? "cyan" : "white"} bold={field === "url"}>
            {field === "url" ? "▶ " : "  "}Agent URL
          </Text>
          <Box paddingLeft={2} flexDirection="column">
            <SearchInput
              value={agentUrl}
              onChange={onChangeUrl}
              placeholder="192.168.x.x:8888"
              focus={field === "url"}
            />
            <Text dimColor>IP or hostname of the remote machine — port defaults to 8888</Text>
          </Box>
        </Box>

      </Box>

      <Divider />
      <Box paddingX={2} gap={3}>
        <Text dimColor>[Tab/↑↓] switch</Text>
        <Text color={canAdvance ? "cyan" : "gray"}>[Enter] next →</Text>
        <Text dimColor>[q/Esc] cancel</Text>
      </Box>
    </Box>
  );
}

// ── Step 2 — Deploy + Ping ────────────────────────────────────────────────────

function DeployStep({
  name, agentUrl, port,
  onSave, onBack,
}: {
  name:     string;
  agentUrl: string;
  port:     number;
  onSave:   () => void;
  onBack:   () => void;
}) {
  const [pingState,  setPingState]  = useState<PingState>("idle");
  const [pingDetail, setPingDetail] = useState<string>("");
  const [showWin,    setShowWin]    = useState(false);

  const handlePing = useCallback(async () => {
    setPingState("pinging");
    setPingDetail("");
    try {
      // Build a minimal env-like object for pingAgent
      const fakeEnv = { agentUrl, agentStatus: "unknown" } as unknown as UnaxisEnvironment;
      const result  = await pingAgent(fakeEnv);
      if (result.online) {
        setPingState("success");
        setPingDetail(`agent v${result.version || "?"}`);
      } else {
        setPingState("failure");
        setPingDetail(result.detail ?? "connection refused");
      }
    } catch (err) {
      setPingState("failure");
      setPingDetail(err instanceof Error ? err.message : String(err));
    }
  }, [agentUrl]);

  useInput((input, key) => {
    if (pingState === "pinging") return;
    if (key.escape || input === "q") { onBack();     return; }
    if (input === "p")               { handlePing(); return; }
    if (input === "w")               { setShowWin((v) => !v); return; }
    if (key.return)                  { onSave();     return; }
  });

  const cmdLines = (showWin ? deployCmdWindows(port) : deployCmd(port)).split("\n");

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2} paddingX={1}>
        <Text bold color="cyan">New Environment</Text>
        <Text dimColor>step 2 of 2 — deploy agent on</Text>
        <Text bold color="white">{name}</Text>
      </Box>
      <Divider />

      {/* Deploy command box */}
      <Box paddingX={2} flexDirection="column" gap={0}>
        <Box gap={2} marginBottom={0}>
          <Text color="yellow" bold>Run on {name}:</Text>
          <Text dimColor>[w] show {showWin ? "Linux" : "Windows"} command</Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          marginTop={0}
        >
          {cmdLines.map((line, i) => (
            <Text key={i} color="cyan" dimColor={line.startsWith(" ") || line.startsWith("  ")}>{line}</Text>
          ))}
        </Box>
        <Text dimColor paddingLeft={1}>
          connects to: <Text color="white">{agentUrl}</Text>
        </Text>
      </Box>

      {/* Ping result */}
      <Box paddingX={2} flexDirection="column">
        {pingState === "idle" && (
          <Text dimColor>
            Press <Text color="cyan">[p]</Text> to test the connection,
            or <Text color="cyan">[Enter]</Text> to save and connect later
          </Text>
        )}
        {pingState === "pinging" && (
          <Box gap={1}>
            <Spinner />
            <Text color="yellow">Connecting to {agentUrl} …</Text>
          </Box>
        )}
        {pingState === "success" && (
          <Box flexDirection="column">
            <Text color="green" bold>✓ Connected</Text>
            <Text color="green" dimColor>{pingDetail}</Text>
          </Box>
        )}
        {pingState === "failure" && (
          <Box flexDirection="column">
            <Text color="red" bold>Failure</Text>
            <Text color="red" wrap="wrap">{pingDetail}</Text>
          </Box>
        )}
      </Box>

      <Divider />
      <Box paddingX={2} gap={3}>
        <Text dimColor>[p] ping</Text>
        <Text dimColor>[w] toggle OS</Text>
        <Text color={pingState === "success" ? "green" : "cyan"} bold>[Enter] save</Text>
        <Text dimColor>[Esc] back</Text>
      </Box>
    </Box>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

export function AddEnvironmentScreen({ onDone, onCancel }: AddEnvironmentScreenProps) {
  const [step,     setStep]     = useState<WizardStep>("details");
  const [name,     setName]     = useState("");
  const [agentUrl, setAgentUrl] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { url: parsedUrl, port } = parseAgentUrl(agentUrl);

  const handleSave = useCallback(async () => {
    setStep("saving");
    setSaveError(null);
    try {
      await createEnvironment({
        name:       name.trim(),
        type:       "remote-docker",
        agent_url:  parsedUrl,
        agent_port: port,
      });
      onDone();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setStep("deploy");
    }
  }, [name, parsedUrl, port, onDone]);

  if (step === "saving") {
    return (
      <Box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
        <Box gap={1}>
          <Spinner />
          <Text color="cyan">Saving {name.trim()} to Supabase…</Text>
        </Box>
      </Box>
    );
  }

  if (step === "deploy") {
    return (
      <Box flexDirection="column" gap={0}>
        <DeployStep
          name={name.trim()}
          agentUrl={parsedUrl}
          port={port}
          onSave={handleSave}
          onBack={() => setStep("details")}
        />
        {saveError && (
          <Box paddingX={2}>
            <Text color="red">✗ Save failed: {saveError}</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <DetailsStep
      name={name}
      agentUrl={agentUrl}
      onChangeName={setName}
      onChangeUrl={setAgentUrl}
      onNext={() => setStep("deploy")}
      onCancel={onCancel}
    />
  );
}
