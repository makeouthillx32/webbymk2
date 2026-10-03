// src/ink/zone-move.ts
// `unaxis zone <key> move <env>` — put a zone on another UNAXIS host.
//
// Order matters so the site stays up the whole time:
//   1. point the zone at the new host and build + deploy it there (the normal
//      ship pipeline: image → agent deploy → NPM repointed to host:port)
//   2. only once that succeeded, remove the old container from the old host
// A failed deploy puts the zone back on its old host; the old container was
// never touched, so the site keeps serving from where it was.

import type { Zone } from "../config/zones.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";

type Line = (l: string) => void;

/** The environment a zone runs on: its assigned one, else the local/default host. */
export function currentZoneEnv(zone: Zone, envs: UnaxisEnvironment[]): UnaxisEnvironment | null {
  const id = (zone as any).environmentId as string | null | undefined;
  if (id) return envs.find((e) => e.id === id) ?? null;
  return envs.find((e) => e.type === "local-docker") ?? null;
}

export function findEnv(envs: UnaxisEnvironment[], name: string): UnaxisEnvironment | null {
  const n = name.trim().toLowerCase();
  return envs.find((e) => e.name.toLowerCase() === n || e.id === name) ?? null;
}

async function removeOldContainer(container: string, env: UnaxisEnvironment | null, onLine: Line): Promise<void> {
  if (!env || env.type === "local-docker" || !env.agentUrl) {
    const { spawnSync } = await import("child_process");
    const r = spawnSync("docker", ["rm", "-f", container], { encoding: "utf-8", timeout: 60_000 });
    onLine(r.status === 0 ? `  ✓ removed ${container} from ${env?.name ?? "this host"}` : `  ⚠ couldn't remove ${container}: ${(r.stderr || "").trim()}`);
    return;
  }
  const { dockerFetch } = await import("./agent-client.ts");
  const res = await dockerFetch(env, `/containers/${encodeURIComponent(container)}?force=true`, { method: "DELETE" });
  if (res.ok || res.status === 404) onLine(`  ✓ removed ${container} from ${env.name}`);
  else onLine(`  ⚠ couldn't remove ${container} from ${env.name} (HTTP ${res.status}) — remove it by hand`);
}

export async function moveZone(
  zone: Zone,
  targetName: string,
  onLine: Line,
  opts: { ref?: string } = {},
): Promise<number> {
  const { dbGetEnvironments } = await import("./control-db.ts");
  const { setZoneEnvironment } = await import("./zone-store.ts");
  const { buildAndDeploy } = await import("./zone-build.ts");

  const envs = dbGetEnvironments();
  const target = findEnv(envs, targetName);
  if (!target) { onLine(`✗ no environment "${targetName}" — have: ${envs.map((e) => e.name).join(", ")}`); return 2; }
  const from = currentZoneEnv(zone, envs);
  if (from?.id === target.id) { onLine(`✓ ${zone.label} already runs on ${target.name}`); return 0; }

  const prevId = ((zone as any).environmentId as string | null | undefined) ?? null;
  const targetId = target.type === "local-docker" ? null : target.id;
  onLine(`=== Moving ${zone.label}: ${from?.name ?? "?"} → ${target.name} ===`);

  setZoneEnvironment(zone.key, targetId);
  const moved = { ...zone, environmentId: targetId } as Zone;
  const code = await buildAndDeploy(moved, onLine, { ref: opts.ref });
  if (code !== 0) {
    setZoneEnvironment(zone.key, prevId);
    onLine(`✗ deploy to ${target.name} failed — ${zone.label} stays on ${from?.name ?? "its old host"}, nothing removed`);
    return code;
  }

  onLine(`• ${zone.label} is live on ${target.name}; removing the old container`);
  await removeOldContainer(zone.container, from, onLine);
  onLine(`✓ moved ${zone.label} to ${target.name}`);
  return 0;
}
