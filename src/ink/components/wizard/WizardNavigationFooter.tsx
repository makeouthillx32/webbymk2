// src/ink/components/wizard/WizardNavigationFooter.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Bottom-row hints for the zone wizard.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Text } from "../../runtimeInk.js";

import { Byline } from "../design-system/Byline.js";
import { KeyboardShortcutHint } from "../design-system/KeyboardShortcutHint.js";
import { useWizardContext } from "./WizardProvider.js";

export function WizardNavigationFooter(): React.ReactNode {
  const { step } = useWizardContext();

  const hints = {
    key: (
      <Byline>
        <KeyboardShortcutHint shortcut="Enter" action="continue" />
        <KeyboardShortcutHint shortcut="Esc" action="cancel" />
      </Byline>
    ),
    label: (
      <Byline>
        <KeyboardShortcutHint shortcut="Enter" action="continue" />
        <KeyboardShortcutHint shortcut="Esc" action="go back" />
      </Byline>
    ),
    layout: (
      <Byline>
        <KeyboardShortcutHint shortcut="� � " action="navigate" />
        <KeyboardShortcutHint shortcut="Enter" action="confirm" />
        <KeyboardShortcutHint shortcut="Esc" action="go back" />
      </Byline>
    ),
    sections: (
      <Byline>
        <KeyboardShortcutHint shortcut="Space" action="toggle" />
        <KeyboardShortcutHint shortcut="� � " action="navigate" />
        <KeyboardShortcutHint shortcut="Enter" action="confirm" />
        <KeyboardShortcutHint shortcut="Esc" action="go back" />
      </Byline>
    ),
    confirm: (
      <Byline>
        <KeyboardShortcutHint shortcut="Enter" action="launch" />
        <KeyboardShortcutHint shortcut="Esc" action="go back" />
      </Byline>
    ),
  }[step];

  return (
    <Text dimColor italic>
      {hints}
    </Text>
  );
}
