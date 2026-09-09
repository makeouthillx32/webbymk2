import AdminConsole from "@/zones/tank/admin/AdminConsole";
import { requireTankAdmin } from "@/zones/tank/admin/requireTankAdmin";

export default async function AdminOverviewPage() {
  await requireTankAdmin();
  return <AdminConsole />;
}
