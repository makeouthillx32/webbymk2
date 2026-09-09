import { notFound } from "next/navigation";
import AdminConsole from "@/zones/tank/admin/AdminConsole";
import { requireTankAdmin } from "@/zones/tank/admin/requireTankAdmin";
import type { AdminSection } from "@/zones/tank/contracts";

const sections: AdminSection[] = [
  "overview",
  "director",
  "sources",
  "channels",
  "chat",
  "economy",
  "drops",
  "tavern",
  "webhooks",
  "users",
  "system",
];

export default async function AdminSectionPage() {
  await requireTankAdmin();
  return <AdminConsole />;
}
