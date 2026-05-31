/** @jsxRuntime classic */
// src/screens/CloneWizardScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Clone Wizard — create a new independent runtime instance from a snapshot.
//
// Steps:
//   1. Name    — choose a display name (DNS slug auto-derived)
//   2. Preview — confirm source bundle + what will be created
//   3. Deploy  — runs cloneFromSnapshot() with live log output
//
// Uses the lean instance template path:
//   createRuntimeInstance → docker compose up → restoreInstance → NPM → MCP
//
// The clone always gets a fresh lean Docker stack, fresh secrets, proper Kong
// host-based routing, and appears in the TUI instance list immediately.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "../ink/reactRuntime.js";
import { Box, Text, useInput } from "../ink/runtimeInk.js";
import type { SnapshotBundle } from "../ink/zone/snapshot.js";
import { Divider }             from "../ink/components/Divider.jsx";
import { SearchInput }         from "../ink/components/SearchBox.jsx";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = "name" | "preview";

export interface CloneWizardScreenProps {
  bundle:    SnapshotBundle;          // the source snapshot to clone from
  /** Called when step 2 is confirmed — caller closes wizard + fires runOp. */
  onDeploy:  (name: string) => void;
  onCancel:  () => void;
}

// ── Slug derivation ───────────────────────────────────────────────────────────

function toSlugPreview(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-clone";
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Step 1 — Name ─────────────────────────────────────────────────────────────

function NamingStep({
  bundle, name, onChangeName, onNext, onCancel,
}: {
  bundle:        SnapshotBundle;
  name:          string;
  onChangeName:  (v: string) => void;
  onNext:        () => void;
  onCancel:      () => void;
}) {
  const slug = toSlugPreview(name);

  useInput((_input, key) => {
    if (key.return && name.trim().length > 0) { onNext(); return; }
    if (key.escape) { onCancel(); return; }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Divider title="Clone Instance  ·  Step 1 of 3  ·  Name" color="yellow" />

      {/* Source info */}
      <Box flexDirection="column" paddingX={2} marginBottom={1}>
        <Box gap={1}>
          <Text dimColor>{"Source  "}</Text>
          <Text color="yellow">{bundle.id}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>{"From    "}</Text>
          <Text dimColor>{bundle.instanceSlug}  ·  {fmtDate(bundle.createdAt)}</Text>
        </Box>
      </Box>

      {/* Name input */}
      <Box flexDirection="column" paddingX={2} gap={1}>
        <Box gap={1}>
          <Text dimColor>{"Name    "}</Text>
          <SearchInput
            value={name}
            onChange={onChangeName}
            placeholder="my-clone"
            width={32}
          />
        </Box>
        <Box gap={1}>
          <Text dimColor>{"Slug    "}</Text>
          <Text color="gray">{slug}-{"<timestamp>"}</Text>
        </Box>
      </Box>

      <Box paddingX={2} marginTop={1} gap={3}>
        <Text dimColor>[↵] next</Text>
        <Text dimColor>[Esc] cancel</Text>
      </Box>
    </Box>
  );
}

// ── Step 2 — Preview ──────────────────────────────────────────────────────────

function PreviewStep({
  bundle, name, onNext, onBack,
}: {
  bundle:  SnapshotBundle;
  name:    string;
  onNext:  () => void;
  onBack:  () => void;
}) {
  const dnsSlug = toSlugPreview(name);

  useInput((_input, key) => {
    if (key.return) { onNext(); return; }
    if (key.escape) { onBack();  return; }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Divider title="Clone Instance  ·  Step 2 of 3  ·  Preview" color="yellow" />

      <Box flexDirection="column" paddingX={2}>
        <Box gap={1} marginBottom={1}>
          <Text bold>{name}</Text>
          <Text dimColor>←</Text>
          <Text color="yellow">{bundle.id}</Text>
        </Box>

        <Box gap={1}><Text dimColor>{"Source bundle "}</Text><Text>{bundle.id}</Text></Box>
        <Box gap={1}><Text dimColor>{"Captured      "}</Text><Text dimColor>{fmtDate(bundle.createdAt)}</Text></Box>
        <Box gap={1}><Text dimColor>{"Origin        "}</Text><Text dimColor>{bundle.instanceSlug}</Text></Box>
        <Box marginTop={1} gap={1}><Text dimColor>{"DNS slug      "}</Text><Text color="cyan">{dnsSlug}</Text></Box>
        <Box gap={1}><Text dimColor>{"Public API    "}</Text><Text dimColor>db.{dnsSlug}.unenter.live</Text></Box>
        <Box gap={1}><Text dimColor>{"Public Studio "}</Text><Text dimColor>studio.{dnsSlug}.unenter.live</Text></Box>
        <Box marginTop={1} gap={1}><Text dimColor>{"Template      "}</Text><Text dimColor>lean (Kong 2.8.1 + host routing)</Text></Box>
        <Box gap={1}><Text dimColor>{"Secrets       "}</Text><Text dimColor>fresh set generated</Text></Box>
        <Box gap={1}><Text dimColor>{"Data          "}</Text><Text color="green">restored from snapshot ✓</Text></Box>
        <Box gap={1}><Text dimColor>{"NPM / MCP     "}</Text><Text dimColor>auto-registered on deploy</Text></Box>
      </Box>

      <Box paddingX={2} marginTop={1} gap={3}>
        <Text dimColor>[↵] deploy clone</Text>
        <Text dimColor>[Esc] back</Text>
      </Box>
    </Box>
  );
}

// ── CloneWizardScreen — main ──────────────────────────────────────────────────
// Steps 1-2 run in the wizard dialog.
// Step 3 (deploy) is handed off to the caller via onDeploy — the caller closes
// the wizard and fires runOp/runOpQueued so output streams through the shared
// OperationOverlay (scroll, copy, detach all work).

export function CloneWizardScreen({ bundle, onDeploy, onCancel }: CloneWizardScreenProps) {
  const [step, setStep] = useState<WizardStep>("name");
  const [name, setName] = useState("");

  return (
    <Box flexDirection="column">
      {step === "name" && (
        <NamingStep
          bundle={bundle}
          name={name}
          onChangeName={setName}
          onNext={() => setStep("preview")}
          onCancel={onCancel}
        />
      )}
      {step === "preview" && (
        <PreviewStep
          bundle={bundle}
          name={name}
          onNext={() => onDeploy(name)}
          onBack={() => setStep("name")}
        />
      )}
    </Box>
  );
}
