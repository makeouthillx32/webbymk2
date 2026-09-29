import { createClient } from "@supabase/supabase-js";
import { runtimeSeedRows } from "./runtimeIdentityEnrolment";

const EXPECTED_TARGETS = [
  "james",
  "joe",
  "kitty",
  "malia",
  "molly",
  "olly",
  "tyler",
] as const;

function required(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`One of ${names.join(", ")} is required.`);
}

async function main() {
  const supabaseUrl = required(
    "SUPABASE_URL_PUBLIC",
    "NEXT_PUBLIC_SUPABASE_URL_BROWSER",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
  );
  const serviceRoleKey = required(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVICE_ROLE_KEY",
  );
  const tankBaseUrl = required("TANK_VERIFY_BASE_URL", "TANK_BASE_URL").replace(
    /\/$/,
    "",
  );
  const ingestSecret = required("TANK_ARCHIVE_INGEST_SECRET");

  const expectedRows = runtimeSeedRows();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("tank_appearance_enrolment")
    .select("id,target_slug,is_active,signature_length")
    .in(
      "id",
      expectedRows.map((row) => row.id),
    );
  if (error) throw new Error(`Enrollment read failed: ${error.message}`);

  const compatible = (data ?? []).filter(
    (row) => row.is_active && row.signature_length === 40,
  );
  const databaseTargets = [
    ...new Set(compatible.map((row) => row.target_slug)),
  ].sort();
  const databaseReady =
    compatible.length === expectedRows.length &&
    EXPECTED_TARGETS.every((target) => databaseTargets.includes(target));

  const response = await fetch(`${tankBaseUrl}/api/tank/director/telemetry`, {
    headers: { "x-tank-ingest-secret": ingestSecret },
  });
  if (!response.ok) {
    throw new Error(`Telemetry read failed with HTTP ${response.status}`);
  }
  const telemetry = (await response.json()) as {
    serverDetectionActive?: boolean;
    appearance?: {
      signatures?: number;
      targets?: Record<string, number>;
      rejected?: unknown[];
      seed?: { ready?: boolean; error?: string | null } | null;
    } | null;
  };
  const workerTargets = Object.keys(telemetry.appearance?.targets ?? {}).sort();
  const workerReady =
    telemetry.serverDetectionActive === true &&
    (telemetry.appearance?.signatures ?? 0) >= expectedRows.length &&
    EXPECTED_TARGETS.every((target) => workerTargets.includes(target)) &&
    (telemetry.appearance?.rejected?.length ?? 0) === 0 &&
    telemetry.appearance?.seed?.ready === true;

  const result = {
    database: {
      ready: databaseReady,
      activeCompatible: compatible.length,
      expected: expectedRows.length,
      targets: databaseTargets,
    },
    worker: {
      ready: workerReady,
      online: telemetry.serverDetectionActive === true,
      loadedSignatures: telemetry.appearance?.signatures ?? 0,
      targets: workerTargets,
      rejected: telemetry.appearance?.rejected?.length ?? null,
      seedReady: telemetry.appearance?.seed?.ready ?? false,
      seedError: telemetry.appearance?.seed?.error ?? null,
    },
  };
  console.log(JSON.stringify(result, null, 2));

  if (!databaseReady || !workerReady) process.exitCode = 1;
}

await main();
