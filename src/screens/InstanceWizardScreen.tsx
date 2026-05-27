/** @jsxRuntime classic */
// src/ink/screens/InstanceWizardScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Instance Wizard — Phase 5 of the Core Runtime Control Plane.
//
// Three-step wizard for creating and deploying a new Supabase runtime instance.
//
// Step 1 — Naming
//   Name  →  auto-derived slug
//
// Step 2 — Runtime Preview
//   Shows computed ports, container names, JWT keys, studio URL
//   before any deployment begins.
//
// Step 3 — Deployment
//   Real-time docker compose output streamed via OperationOverlay-style log.
//   Runs initializeSupabaseCore → createRuntimeInstance → startCoreStack.
//
// Navigation:
//   Enter    — advance / confirm
//   Esc      — back one step
//   q        — cancel (onCancel)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback } from "../ink/reactRuntime.js";
import { Box, Text, useInput } from "../ink/runtimeInk.js";
import {
  generateRandomString,
  generateJWT,
  type RuntimeInstance,
  type RuntimePorts,
  type RuntimeSecrets,
} from "../ink/zone/supabase-factory.js";
import { createBlankDatabase } from "../ink/zone/database-manager.js";
import { Divider } from "../ink/components/Divider.jsx";
import { SearchInput } from "../ink/components/SearchBox.jsx";
import ScrollBox from "../ink/components/ScrollBox.jsx";
import { Spinner } from "../ink/components/Spinner.jsx";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = "name" | "preview" | "deploy";

export interface InstanceWizardScreenProps {
  onDone: (instance: RuntimeInstance) => void;
  onCancel: () => void;
}

// ── Slug derivation (mirrors factory logic, no timestamp yet) ─────────────────

function toSlugPreview(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-instance";
}

// ── Port preview (from a fake timestamp, for display only) ───────────────────

function previewPorts(name: string): RuntimePorts {
  const base = 8000 + (name.length * 7 % 1000);
  return {
    kong: base,
    kongSSL: base + 443,
    postgres: base + 2000,
    pooler: base + 3000,
    analytics: base + 1000,
    studio: base + 100,
  };
}

// ── Step 1 — Naming ───────────────────────────────────────────────────────────

// ── Slug validation (sync subset — reserved + format only; registry check at deploy) ──

const RESERVED = new Set([
  "www", "api", "db", "studio", "mail", "cdn", "app", "admin",
  "ftp", "smtp", "pop", "imap", "vpn", "ns", "ns1", "ns2",
  "unenter", "core", "template", "test", "dev", "staging", "prod",
]);

function validateSlugSync(slug: string): string | null {
  if (!slug) return null; // empty — no error yet
  if (slug.length < 2)   return "Too short (min 2 chars)";
  if (slug.length > 40)  return "Too long (max 40 chars)";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug))
    return "Lowercase letters, digits, hyphens only — must start & end with a letter or digit";
  if (/--/.test(slug))   return "No consecutive hyphens";
  if (RESERVED.has(slug)) return `"${slug}" is reserved — try "${slug}-db" or "my${slug}"`;
  return null; // valid
}

function NamingStep({
  name,
  onChangeName,
  onNext,
  onCancel,
}: {
  name: string;
  onChangeName: (v: string) => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const slug  = toSlugPreview(name);
  const error = validateSlugSync(slug);
  const ready = name.trim().length > 0 && error === null;

  useInput((_input, key) => {
    if (key.return && ready) { onNext(); return; }
    if (key.escape) { onCancel(); return; }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Divider title="New Instance  ·  Step 1 of 3  ·  Naming" color="magenta" />

      <Box flexDirection="column" paddingX={2} gap={1}>
        <Box gap={1}>
          <Text dimColor>{"Name".padEnd(8)}</Text>
          <SearchInput
            value={name}
            onChange={onChangeName}
            placeholder="my-supabase"
            width={32}
          />
        </Box>

        <Box gap={1}>
          <Text dimColor>{"Slug".padEnd(8)}</Text>
          <Text color={error ? "red" : "gray"}>{slug}-{"{timestamp}"}</Text>
        </Box>

        {error ? (
          <Box gap={1}>
            <Text color="red">✗ {error}</Text>
          </Box>
        ) : slug.length >= 2 ? (
          <Box gap={1}>
            <Text color="green">✓ looks good</Text>
          </Box>
        ) : (
          <Box gap={1}>
            <Text dimColor>{"Type".padEnd(8)}</Text>
            <Text color="cyan">Supabase Runtime</Text>
          </Box>
        )}
      </Box>

      <Box paddingX={2} marginTop={1} gap={3}>
        <Text dimColor={!ready} color={ready ? "white" : undefined}>[↵]</Text>
        <Text dimColor={!ready}>{ready ? "next" : "fix name to continue"}</Text>
        <Text dimColor>[Esc]</Text><Text dimColor>cancel</Text>
      </Box>
    </Box>
  );
}

// ── Step 2 — Runtime Preview ──────────────────────────────────────────────────

function PreviewStep({
  name,
  onNext,
  onBack,
}: {
  name: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const slug = toSlugPreview(name);
  const ports = previewPorts(name);

  const rows: [string, string, string?][] = [
    // Ports
    ["Kong (API)", String(ports.kong), "KONG_HTTP_PORT"],
    ["Studio", String(ports.studio), "STUDIO_PORT"],
    ["Postgres", String(ports.postgres), "POSTGRES_PORT"],
    ["Pooler", String(ports.pooler), "POOLER_PROXY_PORT_TRANSACTION"],
    ["Analytics", String(ports.analytics), "ANALYTICS_PORT"],
    // Containers (derived from slug)
    [""],
    ["db container", `${slug}-{ts}-db`],
    ["kong", `${slug}-{ts}-kong`],
    ["auth", `${slug}-{ts}-auth`],
    ["studio", `${slug}-{ts}-studio`],
    // URLs
    [""],
    ["Studio URL", `http://127.0.0.1:${ports.studio}`],
    ["API URL", `http://127.0.0.1:${ports.kong}`],
    // Secrets (generated at create time)
    [""],
    ["POSTGRES_PASSWORD", "<generated 32-char>"],
    ["JWT_SECRET", "<generated 64-char>"],
    ["ANON_KEY", "<JWT HS256 anon>"],
    ["SERVICE_ROLE_KEY", "<JWT HS256 service_role>"],
  ];

  useInput((_input, key) => {
    if (key.return) { onNext(); return; }
    if (key.escape) { onBack(); return; }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Divider title="New Instance  ·  Step 2 of 3  ·  Runtime Preview" color="magenta" />

      <Box flexDirection="column" paddingX={2}>
        <Box gap={1} marginBottom={1}>
          <Text bold>{name}</Text>
          <Text dimColor>→</Text>
          <Text color="cyan">{slug}-{"<timestamp>"}</Text>
        </Box>

        {rows.map(([k, v, hint], i) => {
          if (k === "") return <Box key={i} marginTop={1} />;
          return (
            <Box key={i} gap={1}>
              <Text dimColor>{k.padEnd(22)}</Text>
              <Text color="white">{v}</Text>
              {hint && <Text dimColor>  # {hint}</Text>}
            </Box>
          );
        })}
      </Box>

      <Box paddingX={2} marginTop={1} gap={3}>
        <Text dimColor>[↵]</Text><Text dimColor>deploy</Text>
        <Text dimColor>[Esc]</Text><Text dimColor>back</Text>
      </Box>
    </Box>
  );
}

// ── Step 3 — Deployment ───────────────────────────────────────────────────────

type DeployPhase = "idle" | "init" | "create" | "start" | "done" | "error";

function DeployStep({
  name,
  onDone,
  onBack,
}: {
  name: string;
  onDone: (instance: RuntimeInstance) => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [instance, setInstance] = useState<RuntimeInstance | null>(null);
  const started = useRef(false);

  const addLine = useCallback((l: string) => {
    setLines((prev) => [...prev, l]);
  }, []);

  // Auto-start on mount
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        setPhase("init");
        addLine("── Blank database provisioning ──────────────────────────");

        const result = await createBlankDatabase(
          name,
          { registerNpm: true, instanceName: name },
          addLine,
        );

        addLine("");
        addLine(`✓ "${name}" is live`);
        addLine(`  Studio  →  ${result.instance.studioUrl}`);
        addLine(`  API     →  http://127.0.0.1:${result.instance.ports.kong}`);
        if (result.publicStudioUrl) {
          addLine(`  Public  →  ${result.publicStudioUrl}`);
        }
        setPhase("done");
        setInstance(result.instance);

      } catch (err) {
        addLine(`✗ ${err instanceof Error ? err.message : String(err)}`);
        setPhase("error");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // [↵] to finish once done
  useInput((_input, key) => {
    if (phase === "done" && key.return) { onDone(instance!); return; }
    if (phase === "error" && key.escape) { onBack(); return; }
  });

  const phaseLabel: Record<DeployPhase, string> = {
    idle:   "Preparing…",
    init:   "Provisioning blank database…",
    create: "Provisioning blank database…",
    start:  "Provisioning blank database…",
    done:   "Deployment complete",
    error:  "Deployment failed",
  };

  const phaseColor: Record<DeployPhase, string> = {
    idle:   "gray",
    init:   "cyan",
    create: "cyan",
    start:  "cyan",
    done:   "green",
    error:  "red",
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Divider title="New Instance  ·  Step 3 of 3  ·  Deployment" color="magenta" />

      <Box paddingX={2} gap={2} marginBottom={1}>
        {phase !== "done" && phase !== "error" && <Spinner active={true} />}
        {phase === "done" && <Text color="green">✓</Text>}
        {phase === "error" && <Text color="red">✗</Text>}
        <Text color={phaseColor[phase]}>{phaseLabel[phase]}</Text>
      </Box>

      {/* Live log output */}
      <Box paddingX={2}>
        <ScrollBox height={16}>
          <Box flexDirection="column">
            {lines.map((l, i) => (
              <Text key={i} wrap="truncate" dimColor={l.startsWith("  ")} color={
                l.startsWith("✓") ? "green" :
                  l.startsWith("✗") ? "red" :
                    l.startsWith("⚠") ? "yellow" : undefined
              }>
                {l}
              </Text>
            ))}
          </Box>
        </ScrollBox>
      </Box>

      <Box paddingX={2} marginTop={1} gap={3}>
        {phase === "done" && <><Text dimColor>[↵]</Text><Text dimColor>finish</Text></>}
        {phase === "error" && <><Text dimColor>[Esc]</Text><Text dimColor>back</Text></>}
        {phase !== "done" && phase !== "error" && (
          <Text dimColor>deployment in progress...</Text>
        )}
      </Box>
    </Box>
  );
}

// ── InstanceWizardScreen — main ───────────────────────────────────────────────

export function InstanceWizardScreen({ onDone, onCancel }: InstanceWizardScreenProps) {
  const [step, setStep] = useState<WizardStep>("name");
  const [name, setName] = useState("");

  return (
    <Box flexDirection="column">
      {step === "name" && (
        <NamingStep
          name={name}
          onChangeName={setName}
          onNext={() => setStep("preview")}
          onCancel={onCancel}
        />
      )}

      {step === "preview" && (
        <PreviewStep
          name={name}
          onNext={() => setStep("deploy")}
          onBack={() => setStep("name")}
        />
      )}

      {step === "deploy" && (
        <DeployStep
          name={name}
          onDone={onDone}
          onBack={() => setStep("preview")}
        />
      )}
    </Box>
  );
}
