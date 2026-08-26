import AdminConsole from "@/zones/tank/admin/AdminConsole";
import { requireTankAdmin } from "@/zones/tank/admin/requireTankAdmin";

export default async function AdminOverviewPage() {
  const { profile, user } = await requireTankAdmin();
  return (
    <AdminConsole
      section="overview"
      operatorName={profile.display_name || user.email || "Admin"}
    />
  );
}
