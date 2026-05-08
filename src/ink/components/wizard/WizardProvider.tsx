// src/ink/components/wizard/WizardProvider.tsx
// ─────────────────────────────────────────────────────────────────────────────
// React context wrapper for the zone wizard state.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext } from "react";

import { useWizard, type WizardViewModel, type WizardOptions } from "./useWizard.js";

export interface WizardProviderProps extends WizardOptions {
  children: React.ReactNode;
}

export type WizardContextValue = WizardViewModel & {
  onCancel: () => void;
};

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children, onDone, onCancel }: WizardProviderProps): React.ReactNode {
  const wizard = useWizard({ onDone, onCancel });

  return (
    <WizardContext.Provider value={{ ...wizard, onCancel }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizardContext(): WizardContextValue {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizardContext must be used inside WizardProvider");
  }
  return context;
}
