import { readFileSync } from "node:fs";
import { join } from "node:path";

const serverStartedAt = new Date().toISOString();
let cachedBuildId: string | null | undefined;

/**
 * Next writes one immutable id for every production build. Reading that id
 * gives a long-lived OBS page a safe way to notice that the Tank container was
 * replaced without confusing a camera reconnect with an application deploy.
 */
export function getTankBuildId(): string | null {
  if (cachedBuildId !== undefined) return cachedBuildId;

  try {
    const value = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    cachedBuildId = value || null;
  } catch {
    cachedBuildId = null;
  }

  return cachedBuildId;
}

export function getObsRuntimeHealth() {
  return {
    ok: true as const,
    buildId: getTankBuildId(),
    serverStartedAt,
    checkedAt: new Date().toISOString(),
  };
}

export function handleObsRuntimeHealthGet() {
  return Response.json(getObsRuntimeHealth(), {
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Surrogate-Control": "no-store",
    },
  });
}
