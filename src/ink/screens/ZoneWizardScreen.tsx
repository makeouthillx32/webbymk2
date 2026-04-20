// src/ink/screens/ZoneWizardScreen.tsx
// Multi-step wizard for creating a new zone.
//
// Steps:
//   key      → zone slug  (lowercase letters / numbers / hyphens)
//   label    → display name
//   layout   → header/footer shell
//   sections → dynamic route sections (DS) — filtered by layout type
//   confirm  → preview + launch
//
// onDone(DerivedZone) is called immediately when the user confirms.
// App.tsx runs the full pipeline (scaffold → build → deploy → cert) as a
// detached background operation so the user can navigate freely.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from "react";
import { Box, Text, useInput }     from "ink";
import { useTextInput }            from "../hooks/useTextInput.ts";
import {
  deriveZone, findNextDevPort,
  LAYOUT_OPTIONS, DS_CATALOG,
  type NewZoneParams, type DerivedZone, type LayoutType, type DynamicSection,
} from "../zone-scaffold.ts";
import { Divider }    from "../components/Divider.tsx";
import { useWidths }  from "../hooks/useTermWidth.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = "key" | "label" | "layout" | "sections" | "confirm";

// ── Small UI helpers ──────────────────────────────────────────────────────────

function InputRow({ label, value, active, hint }: {
  label: string; value: string; active: boolean; hint?: string;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text dimColor>{label}</Text>
        <Box borderStyle="single" borderColor={active ? "cyan" : "gray"} paddingX={1} width={36}>
          <Text color={active ? "white" : "gray"}>
            {value || " "}
            {active && <Text color="cyan">▌</Text>}
          </Text>
        </Box>
      </Box>
      {hint && <Text dimColor>  {hint}</Text>}
    </Box>
  );
}

function LayoutPicker({ selected }: { selected: number }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      {LAYOUT_OPTIONS.map((opt, i) => {
        const focused = i === selected;
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

function DSSectionPicker({
  sections,
  selectedIds,
  cursor,
}: {
  sections:    DynamicSection[];
  selectedIds: Set<string>;
  cursor:      number;
}) {
  if (sections.length === 0) {
    return (
      <Box paddingLeft={2} marginTop={1}>
        <Text dimColor>No dynamic sections for this layout type.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      {sections.map((ds, i) => {
        const focused = i === cursor;
        const checked = selectedIds.has(ds.id);
        return (
          <Box key={ds.id} gap={2} paddingX={1}>
            <Text color={focused ? "cyan" : undefined} bold={focused}>
              {focused ? ">" : " "}
            </Text>
            <Text color={checked ? "green" : "gray"}>
              {checked ? "[x]" : "[ ]"}
            </Text>
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

function PreviewTable({ z }: { z: DerivedZone }) {
  const rows: [string, string][] = [
    ["layout",    z.layoutType],
    ["domain",    z.domain],
    ["service",   z.service],
    ["container", z.container],
    ["image",     z.image],
    ["dev port",  `:${z.devPort}`],
  ];
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {rows.map(([k, v]) => (
        <Box key={k} gap={1}>
          <Text dimColor>{k.padEnd(12)}</Text>
          <Text color={k === "layout" ? "yellow" : "white"}>{v}</Text>
        </Box>
      ))}
      {z.dynamicSections.length > 0 && (
        <Box gap={1}>
          <Text dimColor>{"routes".padEnd(12)}</Text>
          <Text color="cyan">{z.dynamicSections.map((s) => s.routePath).join("  ")}</Text>
        </Box>
      )}
    </Box>
  );
}

const PIPELINE_STEPS = [
  { label: "scaffold",      desc: "create files + compose + register in DB" },
  { label: "build & push",  desc: "docker build → push to GHCR"             },
  { label: "deploy",        desc: "docker compose pull + up"                 },
  { label: "wait for live", desc: "poll container until healthy"             },
  { label: "NPM cert",      desc: "create proxy host + Let's Encrypt cert"   },
];

function PipelinePreview() {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {PIPELINE_STEPS.map((s) => (
        <Box key={s.label} gap={2}>
          <Text dimColor>-></Text>
          <Box width={14}><Text dimColor>{s.label}</Text></Box>
          <Text dimColor>{s.desc}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

interface ZoneWizardScreenProps {
  /** Called with the confirmed zone — App.tsx runs the detached pipeline */
  onDone:   (zone: DerivedZone) => void;
  onCancel: () => void;
}

export function ZoneWizardScreen({ onDone, onCancel }: ZoneWizardScreenProps) {
  const { tw, dw } = useWidths();

  const [step,       setStep]       = useState<WizardStep>("key");
  const [keyVal,     setKeyVal]     = useState("");
  const [labelVal,   setLabelVal]   = useState("");
  const [layoutIdx,  setLayoutIdx]  = useState(0);
  const [dsCursor,   setDsCursor]   = useState(0);
  const [dsSelected, setDsSelected] = useState<Set<string>>(new Set());
  const [preview,    setPreview]    = useState<DerivedZone | null>(null);

  // Guard: prevent onDone from firing twice if user taps Enter rapidly
  const launched = useRef(false);

  // ── Key step ───────────────────────────────────────────────────────────────
  const { value: keyInput } = useTextInput({
    active:   step === "key",
    validate: (ch) => /^[a-z0-9-]$/.test(ch),
    onSubmit: (val) => { if (!val) return; setKeyVal(val); setStep("label"); },
    onCancel: onCancel,
  });

  // ── Label step ─────────────────────────────────────────────────────────────
  const { value: labelInput } = useTextInput({
    active:   step === "label",
    onSubmit: (val) => {
      const label = val || keyVal.charAt(0).toUpperCase() + keyVal.slice(1);
      setLabelVal(label);
      setStep("layout");
    },
    onCancel: () => setStep("key"),
  });

  // ── Layout + Sections + Confirm ────────────────────────────────────────────
  useInput(async (input, key) => {

    // ── Layout ──────────────────────────────────────────────────────────────
    if (step === "layout") {
      if (key.upArrow)   { setLayoutIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setLayoutIdx((i) => Math.min(LAYOUT_OPTIONS.length - 1, i + 1)); return; }
      if (key.escape)    { setStep("label"); return; }

      if (key.return) {
        const chosenLayout = LAYOUT_OPTIONS[layoutIdx]!.type as LayoutType;
        const catalog      = DS_CATALOG[chosenLayout] ?? [];

        // Pre-select defaultOn sections
        const defaults = new Set(catalog.filter((d) => d.defaultOn).map((d) => d.id));
        setDsSelected(defaults);
        setDsCursor(0);

        if (catalog.length === 0) {
          // No DS (minimal layout) — skip to confirm
          const port = await findNextDevPort();
          const z = deriveZone(
            { key: keyVal, label: labelVal, layoutType: chosenLayout, dynamicSections: [] },
            port,
          );
          setPreview(z);
          setStep("confirm");
        } else {
          setStep("sections");
        }
        return;
      }
    }

    // ── Sections ────────────────────────────────────────────────────────────
    if (step === "sections") {
      const chosenLayout = LAYOUT_OPTIONS[layoutIdx]!.type as LayoutType;
      const catalog      = DS_CATALOG[chosenLayout] ?? [];

      if (key.upArrow)   { setDsCursor((c) => Math.max(0, c - 1)); return; }
      if (key.downArrow) { setDsCursor((c) => Math.min(catalog.length - 1, c + 1)); return; }
      if (key.escape)    { setStep("layout"); return; }

      if (input === " ") {
        const ds = catalog[dsCursor];
        if (ds) {
          setDsSelected((prev) => {
            const next = new Set(prev);
            if (next.has(ds.id)) next.delete(ds.id); else next.add(ds.id);
            return next;
          });
        }
        return;
      }

      if (key.return) {
        const selected = catalog.filter((d) => dsSelected.has(d.id));
        const port     = await findNextDevPort();
        const z = deriveZone(
          { key: keyVal, label: labelVal, layoutType: chosenLayout, dynamicSections: selected },
          port,
        );
        setPreview(z);
        setStep("confirm");
        return;
      }
    }

    // ── Confirm ──────────────────────────────────────────────────────────────
    if (step === "confirm") {
      if (key.escape) {
        const chosenLayout = LAYOUT_OPTIONS[layoutIdx]!.type as LayoutType;
        const catalog      = DS_CATALOG[chosenLayout] ?? [];
        setStep(catalog.length > 0 ? "sections" : "layout");
        return;
      }
      if (key.return && preview && !launched.current) {
        launched.current = true;
        onDone(preview);
        return;
      }
    }

  }, { isActive: step === "layout" || step === "sections" || step === "confirm" });

  // ── Render ────────────────────────────────────────────────────────────────
  const chosenLayout   = LAYOUT_OPTIONS[layoutIdx]!.type as LayoutType;
  const catalogForView = DS_CATALOG[chosenLayout] ?? [];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      width={tw}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="yellow">+  New Zone</Text>
        <Text dimColor>
          {step === "key"      && "step 1/5 - zone key"}
          {step === "label"    && "step 2/5 - display name"}
          {step === "layout"   && "step 3/5 - layout type"}
          {step === "sections" && "step 4/5 - dynamic sections"}
          {step === "confirm"  && "step 5/5 - confirm"}
        </Text>
      </Box>

      <Divider width={dw} />

      {/* Key */}
      <InputRow
        label="Zone key  "
        value={step === "key" ? keyInput : keyVal}
        active={step === "key"}
        hint={step === "key" ? "lowercase letters, numbers, hyphens  e.g. shop" : undefined}
      />

      {/* Label */}
      {(step === "label" || (step !== "key" && labelVal)) && (
        <InputRow
          label="Label     "
          value={step === "label" ? labelInput : labelVal}
          active={step === "label"}
          hint={step === "label" ? "display name — empty = auto-capitalize key" : undefined}
        />
      )}

      {/* Layout */}
      {(step === "layout" || step === "sections" || step === "confirm") && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Layout</Text>
          {step === "layout"
            ? <LayoutPicker selected={layoutIdx} />
            : (
              <Box paddingLeft={4}>
                <Text color="yellow">{LAYOUT_OPTIONS[layoutIdx]?.label}</Text>
                <Text dimColor>  — {LAYOUT_OPTIONS[layoutIdx]?.desc}</Text>
              </Box>
            )
          }
        </Box>
      )}

      {/* Sections */}
      {step === "sections" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Dynamic route sections</Text>
          <DSSectionPicker
            sections={catalogForView}
            selectedIds={dsSelected}
            cursor={dsCursor}
          />
        </Box>
      )}

      {/* Confirm */}
      {step === "confirm" && preview && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Zone summary</Text>
          <PreviewTable z={preview} />
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

    </Box>
  );
}
