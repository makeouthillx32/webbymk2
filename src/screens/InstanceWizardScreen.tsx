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
// Step 3 — Deployment (handed off to caller)
//   Caller closes the wizard and fires runOpQueued(createBlankDatabase) so the
//   output streams through the shared OperationOverlay — scroll, copy, detach.
//
// Navigation:
//   Enter    — advance / confirm
//   Esc      — back one step
//   q        — cancel (onCancel)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "../ink/reactRuntime.js";
import { Box, Text, useInput } from "../ink/runtimeInk.js";
import { type RuntimePorts } from "../ink/zone/supabase-factory.js";
import { Divider } from "../ink/components/Divider.jsx";
import { SearchInput } from "../ink/components/SearchBox.jsx";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = "name" | "preview";

export interface InstanceWizardScreenProps {
  /** Called when the user confirms step 2 — caller should close the wizard
   *  and push a runOp / runOpQueued with createBlankDatabase so the deployment
   *  runs inside the shared OperationOverlay (scroll, copy, detach all work). */
  onDeploy: (name: string) => void;
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

// ── InstanceWizardScreen — main ───────────────────────────────────────────────
// Steps 1-2 run in the wizard dialog.
// Step 3 (deployment) is handed off to the caller via onDeploy — the caller
// closes the wizard and fires runOp/runOpQueued so the output streams through
// the shared OperationOverlay (scroll, copy, detach all work).

export function InstanceWizardScreen({ onDeploy, onCancel }: InstanceWizardScreenProps) {
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
          onNext={() => onDeploy(name)}
          onBack={() => setStep("name")}
        />
      )}
    </Box>
  );
}
