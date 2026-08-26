import { notFound } from "next/navigation";
import AdminConsole from "@/zones/tank/admin/AdminConsole";
import { requireTankAdmin } from "@/zones/tank/admin/requireTankAdmin";
import type { AdminSection } from "@/zones/tank/contracts";

const sections: AdminSection[] = [
  "director",
  "sources",
  "channels",
  "chat",
  "webhooks",
  "users",
  "system",
];
export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as AdminSection)) notFound();
  const { profile, user } = await requireTankAdmin();
  return (
    <AdminConsole
      section={section as AdminSection}
      operatorName={profile.display_name || user.email || "Admin"}
    />
  );
}
