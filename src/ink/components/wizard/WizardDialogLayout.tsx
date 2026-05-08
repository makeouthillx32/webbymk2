// src/ink/components/wizard/WizardDialogLayout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Main visual shell for the zone wizard.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "ink";

import { Dialog } from "../design-system/Dialog.js";
import { useWidths } from "../../hooks/useTermWidth.js";
import { LAYOUT_OPTIONS } from "../../zone/index.js";
import { WizardNavigationFooter } from "./WizardNavigationFooter.js";
import { useWizardContext } from "./WizardProvider.js";

// ── Small UI helpers ──────────────────────────────────────────────────────────

function InputRow({
  label,
  value,
  active,
  hint,
}: {
  label: string;
  value: string;
  active: boolean;
  hint?: string;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text dimColor>{label}</Text>
        <Box borderStyle="single" borderColor={active ? "cyan" : "gray"} paddingX={1} width={36}>
          <Text color={active ? "white" : "gray"}>
            {value || " "}
            {active && <Text color="cyan">��</Text>}
          </Text>
        </Box>
      </Box>
      {hint && <Text dimColor>  {hint}</Text>}
    </Box>
  );
}

function DSSectionPicker() {
  const { catalog, dsCursor, dsSelected } = useWizardContext();

  if (catalog.length === 0) {
    return (
      <Box paddingLeft={2} marginTop={1}>
        <Text dimColor>No dynamic sections for this layout type.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {catalog.map((ds, i) => {
        const focused = i === dsCursor;
        const checked = dsSelected.has(ds.id);
        return (
          <Box key={ds.id} gap={2} paddingX={1}>
            <Text color={focused ? "cyan" : undefined} bold={focused}>
              {focused ? ">" : " "}
            </Text>
            <Text color={checked ? "green" : "gray"}>{checked ? "[x]" : "[ ]"}</Text>
            <Box width={14}>
              <Text color={focused ? "cyan" : checked ? "green" : undefined} bold={focused}>
                {ds.label}
              </Text>
            </Box>
            <Text dimColor={!focused}>{ds.desc}</Text>
          </Box>
        );
      })}
      <Box paddingLeft={2} marginTop={1}>
        <Text dimColor>[space] toggle  [up/down] navigate  [enter] confirm  [esc] back</Text>
      </Box>
    </Box>
  );
}

function PreviewTable() {
  const { preview } = useWizardContext();
  if (!preview) return null;

  const rows: [string, string][] = [
    ["layout", preview.layoutType],
    ["domain", preview.domain],
    ["service", preview.service],
    ["container", preview.container],
    ["image", preview.image],
    ["dev port", `:${preview.devPort}`],
  ];

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {rows.map(([k, v]) => (
        <Box key={k} gap={1}>
          <Text dimColor>{k.padEnd(12)}</Text>
          <Text color={k === "layout" ? "yellow" : "white"}>{v}</Text>
        </Box>
      ))}
      {preview.dynamicSections.length > 0 && (
        <Box gap={1}>
          <Text dimColor>{"routes".padEnd(12)}</Text>
          <Text color="cyan">{preview.dynamicSections.map((section) => section.routePath).join("  ")}</Text>
        </Box>
      )}
    </Box>
  );
}

const PIPELINE_STEPS = [
  { label: "scaffold", desc: "create files + compose + register in DB" },
  { label: "build & push", desc: "docker build �  push to GHCR" },
  { label: "deploy", desc: "docker compose pull + up" },
  { label: "wait for live", desc: "poll container until healthy" },
  { label: "NPM cert", desc: "create proxy host + Let's Encrypt cert" },
];

function PipelinePreview() {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {PIPELINE_STEPS.map((step) => (
        <Box key={step.label} gap={2}>
          <Text dimColor>� </Text>
          <Box width={14}>
            <Text dimColor>{step.label}</Text>
          </Box>
          <Text dimColor>{step.desc}</Text>
        </Box>
      ))}
    </Box>
  );
}

function LayoutPicker() {
  const { layoutIdx } = useWizardContext();

  return (
    <Box flexDirection="column" marginTop={1}>
      {LAYOUT_OPTIONS.map((opt, i) => {
        const focused = i === layoutIdx;
        return (
          <Box key={opt.type} gap={2} paddingX={1}>
            <Text color={focused ? "cyan" : undefined} bold={focused}>
              {focused ? ">" : " "}
            </Text>
            <Box width={12}>
              <Text color={focused ? "cyan" : undefined} bold={focused}>
                {opt.label}
              </Text>
            </Box>
            <Text dimColor={!focused}>{opt.desc}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function StepBody() {
  const { step, keyInput, labelInput, keyValue, labelValue, layoutOption, preview } = useWizardContext();

  return (
    <>
      {/* Key */}
      <InputRow
        label="Zone key  "
        value={step === "key" ? keyInput : keyValue}
        active={step === "key"}
        hint={step === "key" ? "lowercase letters, numbers, hyphens  e.g. shop" : undefined}
      />

      {/* Label */}
      {(step === "label" || (step !== "key" && labelValue)) && (
        <InputRow
          label="Label     "
          value={step === "label" ? labelInput : labelValue}
          active={step === "label"}
          hint={step === "label" ? "display name — empty = auto-capitalize key" : undefined}
        />
      )}

      {/* Layout */}
      {(step === "layout" || step === "sections" || step === "confirm") && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Layout</Text>
          {step === "layout" ? (
            <LayoutPicker />
          ) : (
            <Box paddingLeft={4}>
              <Text color="yellow">{layoutOption.label}</Text>
              <Text dimColor>  — {layoutOption.desc}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Sections */}
      {step === "sections" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Dynamic route sections</Text>
          <DSSectionPicker />
        </Box>
      )}

      {/* Confirm */}
      {step === "confirm" && preview && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Zone summary</Text>
          <PreviewTable />
          <Box marginTop={1}>
            <Text dimColor>Pipeline:</Text>
          </Box>
          <PipelinePreview />
          <Box marginTop={1} gap={2}>
            <Text color="yellow">[enter] launch</Text>
            <Text dimColor>[esc] back</Text>
          </Box>
        </Box>
      )}
    </>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────

export function WizardDialogLayout(): React.ReactNode {
  const { tw } = useWidths();
  const { stepLabel } = useWizardContext();

  return (
    <Box width={tw}>
      <Dialog
        title="+  New Zone"
        subtitle={stepLabel}
        color="yellow"
        onCancel={() => {}}
        isCancelActive={false}
        hideInputGuide={true}
      >
        <Box flexDirection="column">
          <StepBody />
          <WizardNavigationFooter />
        </Box>
      </Dialog>
    </Box>
  );
}
