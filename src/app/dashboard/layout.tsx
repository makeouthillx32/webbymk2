// app/dashboard/layout.tsx
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/adminGuard";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Hard lock: only admins get past this point.
  // requireAdmin() redirects guests to /sign-in and non-admins to /?error=access_denied
  await requireAdmin();

  return <>{children}</>;
}