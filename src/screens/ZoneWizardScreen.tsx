// src/ink/screens/ZoneWizardScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Multi-step wizard for creating a new zone.
//
// Steps:
//   key      → zone slug  (lowercase letters / numbers / hyphens)
//   label    → display name
//   layout   → header/footer shell  (SelectMenu)
//   footer   → footer choice  (app layout only: none / shop / landing)
//   sections → dynamic route sections (multi-select with [space], layouts that have them)
//   confirm  → preview + launch
//
// Navigation:
//   Enter     → advance / confirm
//   Esc       → back one step
//   q         → exit wizard entirely (onCancel)
//
// onDone(DerivedZone) is called immediately when the user confirms.
// App.tsx runs the full pipeline as a detached background operation.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
import {
  deriveZone, findNextDevPort,
  LAYOUT_OPTIONS, DS_CATALOG,
  type DerivedZone, type LayoutType, type AppFooterType, type DynamicSection,
} from "../ink/zone-scaffold.js";
import { Divider } from "../ink/components/Divider.jsx";
import { SearchInput } from "../ink/components/SearchBox.jsx";
import { SelectMenu } from "../ink/components/SelectMenu.jsx";
import { MultiSelectMenu } from "../ink/components/MultiSelectMenu.jsx";
import { useWidths } from "../ink/hooks/useTermWidth.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = "key" | "label" | "layout" | "footer" | "sections" | "confirm";

// ── Small static helpers ──────────────────────────────────────────────────────

/** Confirmed field — shows a completed (non-editable) value. */
function CompletedField({ label, value }: { label: string; value: string }) {
  return (
    <Box gap={1} marginBottom={1}>
      <Text dimColor>{label}</Text>
      <Box borderStyle="single" borderColor="gray" paddingX={1} width={36}>
        <Text color="gray">{value}</Text>
      </Box>
    </Box>
  );
}

function PreviewTable({ z }: { z: DerivedZone }) {
  const rows: [string, string][] = [
    ["layout", z.layoutType],
    ...(z.layoutType === "app" ? [["footer", z.appFooter] as [string, string]] : []),
    ["domain", z.domain],
    ["service", z.service],
    ["container", z.container],
    ["image", z.image],
    ["dev port", `:${z.devPort}`],
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
  { label: "scaffold", desc: "create files + compose + register in DB" },
  { label: "build & push", desc: "docker build → push to GHCR" },
  { label: "deploy", desc: "docker compose pull + up" },
  { label: "reload proxy", desc: "force-recreate proxy with new UPSTREAM_*" },
  { label: "wait for live", desc: "poll container until healthy" },
  { label: "NPM cert", desc: "create proxy host + Let's Encrypt cert" },
];

function PipelinePreview() {
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {PIPELINE_STEPS.map((s) => (
        <Box key={s.label} gap={2}>
          <Text dimColor>→</Text>
          <Box width={14}><Text dimColor>{s.label}</Text></Box>
          <Text dimColor>{s.desc}</Text>
        </Box>
      ))}
    </Box>
  );
}

function formatZoneSummaryCopy(z: DerivedZone): string {
  const lines: string[] = [
    "Zone Summary",
    `  layout:    ${z.layoutType}${z.layoutType === "app" ? `  footer: ${z.appFooter}` : ""}`,
    `  domain:    ${z.domain}`,
    `  service:   ${z.service}`,
    `  container: ${z.container}`,
    `  image:     ${z.image}`,
    `  dev port:  :${z.devPort}`,
  ];

  if (z.dynamicSections.length > 0) {
    const routes = z.dynamicSections.map((ds) => ds.routePath).join("  ");
    lines.push(`  routes:    ${routes}`);
  }

  lines.push(
    "",
    "Pipeline:",
    "  -> scaffold        create files + compose + register in DB",
    "  -> build & push    docker build -> push to GHCR",
    "  -> deploy          docker compose pull + up",
    "  -> reload proxy    force-recreate proxy with new UPSTREAM_*",
    "  -> wait for live   poll container until healthy",
    "  -> NPM cert        create proxy host + Let's Encrypt cert",
  );

  return lines.join("\n");
}

// ── Layout options shaped for SelectMenu ──────────────────────────────────────

const LAYOUT_MENU = LAYOUT_OPTIONS.map((o) => ({
  id: o.type,
  label: o.label,
  desc: o.desc,
}));

// ── Footer options (only shown for "app" layout) ───────────────────────────────

const FOOTER_MENU = [
  { id: "none", label: "None", desc: "no footer" },
  { id: "shop", label: "Shop", desc: "ShopFooter (e-commerce)" },
  { id: "landing", label: "Landing", desc: "LandingFooter" },
];

// ── Main wizard ───────────────────────────────────────────────────────────────

interface ZoneWizardScreenProps {
  /** Called with the confirmed zone — App.tsx runs the detached pipeline */
  onDone: (zone: DerivedZone) => void;
  /** Called when the user cancels (q or Esc from step 1) */
  onCancel: () => void;
  /** Shared clipboard helper from App.tsx */
  copy: (text: string) => void;
  /** Shared copy flash state from App.tsx */
  didCopy: boolean;
}

export function ZoneWizardScreen({ onDone, onCancel, copy, didCopy }: ZoneWizardScreenProps) {
  const { tw, dw, th } = useWidths();

  const [step, setStep] = useState<WizardStep>("key");
  const [keyVal, setKeyVal] = useState("");
  const [labelVal, setLabelVal] = useState("");
  const [layoutIdx, setLayoutIdx] = useState(0);
  const [footerChoice, setFooterChoice] = useState<AppFooterType>("none");
  const [preview, setPreview] = useState<DerivedZone | null>(null);

  // Guard: prevent onDone from firing twice if user taps Enter rapidly.
  const launched = useRef(false);

  // ── Confirm keyboard ──────────────────────────────────────────────────────
  // Sections are handled by <MultiSelectMenu> internally.
  // Layout is handled by <SelectMenu> internally.
  // Key and Label are handled by <TextInput> internally.
  useInput((input, key) => {

    // [q] exits the wizard entirely from the confirm step.
    if (input === "q") { onCancel(); return; }

    if (key.escape) {
      const chosenLayout = LAYOUT_OPTIONS[layoutIdx]!.type as LayoutType;
      const catalog = DS_CATALOG[chosenLayout] ?? [];
      if (chosenLayout === "app") {
        setStep(catalog.length > 0 ? "sections" : "footer");
      } else {
        setStep(catalog.length > 0 ? "sections" : "layout");
      }
      return;
    }
    if (input === "c" && preview) {
      copy(formatZoneSummaryCopy(preview));
      return;
    }

    if (key.return && preview && !launched.current) {
      launched.current = true;
      onDone(preview);
      return;
    }

  }, { isActive: step === "confirm" });

  // ── Render ────────────────────────────────────────────────────────────────
  const chosenLayout = LAYOUT_OPTIONS[layoutIdx]!.type as LayoutType;
  const catalogForView = DS_CATALOG[chosenLayout] ?? [];

  const stepLabel =
    step === "key" ? "step 1 · zone key" :
      step === "label" ? "step 2 · display name" :
        step === "layout" ? "step 3 · layout type" :
          step === "footer" ? "step 4 · footer" :
            step === "sections" ? `step ${chosenLayout === "app" ? 5 : 4} · dynamic sections` :
              "confirm";

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      width={tw}
      height={th}
      overflow="hidden"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="yellow">+  New Zone</Text>
        <Box gap={3}>
          <Text dimColor>{stepLabel}</Text>
          <Text dimColor>[esc/^C] back  [q] exit</Text>
        </Box>
      </Box>

      <Divider width={dw} />

      {/* ── Step 1: Zone key ──────────────────────────────────────────────── */}
      {step === "key" ? (
        <Box flexDirection="column" marginBottom={1}>
          <Box gap={2}>
            <Text dimColor>Zone key  </Text>
            <SearchInput
              active
              width={36}
              placeholder="e.g. shop"
              validate={(ch) => /^[a-z0-9-]$/.test(ch)}
              onSubmit={(val) => {
                if (!val) return;
                setKeyVal(val);
                setStep("label");
              }}
              onCancel={onCancel}
            />
          </Box>
          <Text dimColor>  lowercase letters, numbers, hyphens</Text>
        </Box>
      ) : (
        <CompletedField label="Zone key  " value={keyVal} />
      )}

      {/* ── Step 2: Label ─────────────────────────────────────────────────── */}
      {step === "label" ? (
        <Box flexDirection="column" marginBottom={1}>
          <Box gap={2}>
            <Text dimColor>Label     </Text>
            <SearchInput
              active
              width={36}
              placeholder={keyVal.charAt(0).toUpperCase() + keyVal.slice(1)}
              onSubmit={(val) => {
                const label = val || keyVal.charAt(0).toUpperCase() + keyVal.slice(1);
                setLabelVal(label);
                setStep("layout");
              }}
              onCancel={() => setStep("key")}
            />
          </Box>
          <Text dimColor>  display name — empty uses capitalized key</Text>
        </Box>
      ) : labelVal ? (
        <CompletedField label="Label     " value={labelVal} />
      ) : null}

      {/* ── Step 3: Layout ────────────────────────────────────────────────── */}
      {step === "layout" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Layout type</Text>
          <SelectMenu
            options={LAYOUT_MENU}
            initialIndex={layoutIdx}
            active
            onSelect={async (opt) => {
              const idx = LAYOUT_OPTIONS.findIndex((o) => o.type === opt.id);
              if (idx !== -1) setLayoutIdx(idx);
              const chosenType = opt.id as LayoutType;
              // App layout: always ask for footer choice before continuing.
              if (chosenType === "app") {
                setStep("footer");
                return;
              }
              const catalog = DS_CATALOG[chosenType] ?? [];
              if (catalog.length === 0) {
                const port = await findNextDevPort();
                const z = deriveZone(
                  { key: keyVal, label: labelVal, layoutType: chosenType, dynamicSections: [] },
                  port,
                );
                setPreview(z);
                setStep("confirm");
              } else {
                setStep("sections");
              }
            }}
            onCancel={() => setStep("label")}
          />
        </Box>
      )}

      {(step === "footer" || step === "sections" || step === "confirm") && (
        <Box paddingLeft={4} marginBottom={1}>
          <Text color="yellow">{LAYOUT_OPTIONS[layoutIdx]?.label}</Text>
          <Text dimColor>  — {LAYOUT_OPTIONS[layoutIdx]?.desc}</Text>
        </Box>
      )}

      {/* ── Step 4: Footer (app layout only) ─────────────────────────────── */}
      {step === "footer" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Footer</Text>
          <SelectMenu
            options={FOOTER_MENU}
            initialIndex={FOOTER_MENU.findIndex((f) => f.id === footerChoice)}
            active
            onSelect={async (opt) => {
              const chosen = opt.id as AppFooterType;
              setFooterChoice(chosen);
              const catalog = DS_CATALOG[chosenLayout] ?? [];
              if (catalog.length === 0) {
                const port = await findNextDevPort();
                const z = deriveZone(
                  { key: keyVal, label: labelVal, layoutType: chosenLayout, appFooter: chosen, dynamicSections: [] },
                  port,
                );
                setPreview(z);
                setStep("confirm");
              } else {
                setStep("sections");
              }
            }}
            onCancel={() => setStep("layout")}
          />
        </Box>
      )}

      {/* ── Step 5: Dynamic sections ──────────────────────────────────────── */}
      {step === "sections" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Dynamic route sections</Text>
          <MultiSelectMenu
            options={catalogForView.map((ds) => ({ id: ds.id, label: ds.label, desc: ds.desc }))}
            initialSelected={new Set(catalogForView.filter((d) => d.defaultOn).map((d) => d.id))}
            onConfirm={async (selectedIds) => {
              const sectionList = catalogForView.filter((d) => selectedIds.has(d.id));
              const port = await findNextDevPort();
              const z = deriveZone(
                { key: keyVal, label: labelVal, layoutType: chosenLayout, appFooter: footerChoice, dynamicSections: sectionList },
                port,
              );
              setPreview(z);
              setStep("confirm");
            }}
            onCancel={() => setStep(chosenLayout === "app" ? "footer" : "layout")}
            onExit={onCancel}
          />
        </Box>
      )}

      {/* ── Confirm ───────────────────────────────────────────────────────── */}
      {step === "confirm" && preview && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Zone summary</Text>
          <PreviewTable z={preview} />
          <Box marginTop={1}>
            <Text dimColor>Pipeline:</Text>
          </Box>
          <PipelinePreview />
          <Box marginTop={1} gap={3}>
            <Text color="yellow">[↵] launch</Text>
            <Text color="yellow">[c] copy</Text>
            <Text dimColor>[esc] back  [q] exit</Text>
            {didCopy && <Text color="green">✓ copied</Text>}
          </Box>
        </Box>
      )}

    </Box>
  );
}
