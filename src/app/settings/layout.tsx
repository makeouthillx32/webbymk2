// app/settings/layout.tsx
import type { ReactNode } from "react";

// No Providers — let the root handle it
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
