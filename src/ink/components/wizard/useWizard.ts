// src/ink/components/wizard/useWizard.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone wizard state machine and derived state.
//
// This hook owns the step logic, keyboard handling, preview generation, and
// the transient selection state used by the wizard UI.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, useState } from "react";
import { useInput } from "ink";

import type { Key } from "../../events/input-event.js";
import { useTextInput } from "../../hooks/useTextInput.js";
import {
  deriveZone,
  findNextDevPort,
  LAYOUT_OPTIONS,
  DS_CATALOG,
  type DerivedZone,
  type DynamicSection,
  type LayoutType,
} from "../../zone/index.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WizardStep = "key" | "label" | "layout" | "sections" | "confirm";

export type WizardLayoutOption = (typeof LAYOUT_OPTIONS)[number];

export interface WizardViewModel {
  step: WizardStep;
  stepLabel: string;

  keyInput: string;
  labelInput: string;
  keyValue: string;
  labelValue: string;

  layoutIdx: number;
  layoutOption: WizardLayoutOption;
  catalog: DynamicSection[];

  dsCursor: number;
  dsSelected: Set<string>;

  preview: DerivedZone | null;
}

export interface WizardOptions {
  onDone: (zone: DerivedZone) => void;
  onCancel: () => void;
}

const STEP_LABELS: Record<WizardStep, string> = {
  key: "step 1/5 - zone key",
  label: "step 2/5 - display name",
  layout: "step 3/5 - layout type",
  sections: "step 4/5 - dynamic sections",
  confirm: "step 5/5 - confirm",
};

function autoLabel(key: string): string {
  if (!key) return "";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function buildSelectedSections(
  catalog: DynamicSection[],
  selectedIds: Set<string>,
): DynamicSection[] {
  return catalog.filter((section) => selectedIds.has(section.id));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWizard({ onDone, onCancel }: WizardOptions): WizardViewModel {
  const [step, setStep] = useState<WizardStep>("key");
  const [keyValue, setKeyValue] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [layoutIdx, setLayoutIdx] = useState(0);
  const [dsCursor, setDsCursor] = useState(0);
  const [dsSelected, setDsSelected] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<DerivedZone | null>(null);

  // Guard against double-launch if the user presses Enter twice on confirm.
  const launched = useRef(false);

  const { value: keyInput } = useTextInput({
    active: step === "key",
    validate: (ch) => /^[a-z0-9-]$/.test(ch),
    onSubmit: (val) => {
      if (!val) return;
      setKeyValue(val);
      setStep("label");
    },
    onCancel,
  });

  const { value: labelInput } = useTextInput({
    active: step === "label",
    onSubmit: (val) => {
      const label = val || autoLabel(keyValue);
      setLabelValue(label);
      setStep("layout");
    },
    onCancel: () => setStep("key"),
  });

  const layoutOption = LAYOUT_OPTIONS[layoutIdx] ?? LAYOUT_OPTIONS[0]!;
  const layoutType = layoutOption.type as LayoutType;
  const catalog = DS_CATALOG[layoutType] ?? [];

  const buildPreview = useCallback(
    async (selectedLayout: LayoutType, selectedSections: DynamicSection[]) => {
      const port = await findNextDevPort();
      const zone = deriveZone(
        {
          key: keyValue,
          label: labelValue || autoLabel(keyValue),
          layoutType: selectedLayout,
          dynamicSections: selectedSections,
        },
        port,
      );
      setPreview(zone);
      return zone;
    },
    [keyValue, labelValue],
  );

  const goBackFromConfirm = useCallback(() => {
    setStep(catalog.length > 0 ? "sections" : "layout");
  }, [catalog.length]);

  useInput(async (input: string, key: Key) => {
    if (step === "layout") {
      if (key.upArrow) {
        setLayoutIdx((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setLayoutIdx((current) => Math.min(LAYOUT_OPTIONS.length - 1, current + 1));
        return;
      }
      if (key.escape) {
        setStep("label");
        return;
      }

      if (key.return) {
        const chosenLayout = LAYOUT_OPTIONS[layoutIdx]!.type as LayoutType;
        const catalogForLayout = DS_CATALOG[chosenLayout] ?? [];
        const defaults = new Set(catalogForLayout.filter((section) => section.defaultOn).map((section) => section.id));
        setDsSelected(defaults);
        setDsCursor(0);

        if (catalogForLayout.length === 0) {
          const zone = await buildPreview(chosenLayout, []);
          setPreview(zone);
          setStep("confirm");
        } else {
          setStep("sections");
        }
      }
      return;
    }

    if (step === "sections") {
      const catalogForLayout = DS_CATALOG[layoutType] ?? [];

      if (key.upArrow) {
        setDsCursor((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setDsCursor((current) => Math.min(catalogForLayout.length - 1, current + 1));
        return;
      }
      if (key.escape) {
        setStep("layout");
        return;
      }

      if (input === " ") {
        const section = catalogForLayout[dsCursor];
        if (section) {
          setDsSelected((current) => {
            const next = new Set(current);
            if (next.has(section.id)) next.delete(section.id);
            else next.add(section.id);
            return next;
          });
        }
        return;
      }

      if (key.return) {
        const selected = buildSelectedSections(catalogForLayout, dsSelected);
        const zone = await buildPreview(layoutType, selected);
        setPreview(zone);
        setStep("confirm");
      }
      return;
    }

    if (step === "confirm") {
      if (key.escape) {
        goBackFromConfirm();
        return;
      }

      if (key.return && preview && !launched.current) {
        launched.current = true;
        onDone(preview);
      }
    }
  }, { isActive: step === "layout" || step === "sections" || step === "confirm" });

  const stepLabel = useMemo(() => STEP_LABELS[step], [step]);

  return {
    step,
    stepLabel,
    keyInput,
    labelInput,
    keyValue,
    labelValue,
    layoutIdx,
    layoutOption,
    catalog,
    dsCursor,
    dsSelected,
    preview,
  };
}
