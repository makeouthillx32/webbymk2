import AdminConsole from "@/zones/tank/admin/AdminConsole";
import { requireTankAdmin } from "@/zones/tank/admin/requireTankAdmin";
import { getServerDirectorState } from "@/zones/tank/server/serverDirectorEngine";
import { loadPersistedOperatorModeFromDb } from "@/zones/tank/server/directorTelemetryStore";
import { loadRotationRosterFromDb } from "@/zones/tank/server/directorRotationStore";

export default async function AdminOverviewPage() {
  await requireTankAdmin();
  const [initialServerDirector, initialMode, initialRoster] = await Promise.all([
    getServerDirectorState().catch(() => null),
    loadPersistedOperatorModeFromDb().catch(() => null),
    loadRotationRosterFromDb().catch(() => null),
  ]);

  return (
    <AdminConsole
      initialServerDirector={initialServerDirector}
      initialMode={initialMode}
      initialRoster={initialRoster}
    />
  );
}
