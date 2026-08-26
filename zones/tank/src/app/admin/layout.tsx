import type { ReactNode } from "react";
import { requireTankAdmin } from "@/zones/tank/admin/requireTankAdmin";

export const dynamic = "force-dynamic";
export default async function TankAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireTankAdmin();
  return <>{children}</>;
}
