// app/dashboard/layout.tsx
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/adminGuard";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Hard lock: only admin + marketing get past this point.
  // requireAdmin() redirects guests to /sign-in and disallowed roles to
  // /?error=access_denied. Individual settings pages/routes still enforce
  // their own, narrower role checks (see src/lib/require-admin.ts's
  // requireRole()) — this is just the outer gate.
  await requireAdmin({ allowedRoles: ['admin', 'marketing'] });

  return <>{children}</>;
}