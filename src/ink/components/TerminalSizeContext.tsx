import React, { createContext, type ReactNode } from 'react';
import { useTermWidth, useTermHeight } from '../hooks/useTermWidth.js';

export type TerminalSize = {
  columns: number;
  rows: number;
};

export const TerminalSizeContext = createContext<TerminalSize | null>(null);

export function TerminalSizeProvider({ children }: { children: ReactNode }) {
  const columns = useTermWidth();
  const rows = useTermHeight();
  return (
    <TerminalSizeContext.Provider value={{ columns, rows }}>
      {children}
    </TerminalSizeContext.Provider>
  );
}