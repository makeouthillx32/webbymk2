export type RuntimeAppearanceSnapshot = {
  workerOnline: boolean;
  appearance: null | {
    targets: Record<string, number>;
  };
};

export type SubjectRuntimeReadiness = {
  storedProfiles: number;
  runtimeLoaded: number;
  workerOnline: boolean;
  ready: boolean;
  label: "READY IN AXIS" | "WORKER OFFLINE" | "NOT LOADED" | "NEEDS PROFILE";
};

/**
 * Join storage readiness with the running worker's own consumption report.
 * A database row alone is not runtime proof, so `ready` requires both.
 */
export function getSubjectRuntimeReadiness(
  targetSlug: string,
  storedProfiles: number,
  runtime: RuntimeAppearanceSnapshot | null,
): SubjectRuntimeReadiness {
  const runtimeLoaded = runtime?.appearance?.targets[targetSlug] ?? 0;
  const workerOnline = runtime?.workerOnline === true;
  const ready = storedProfiles > 0 && workerOnline && runtimeLoaded > 0;

  let label: SubjectRuntimeReadiness["label"];
  if (ready) label = "READY IN AXIS";
  else if (storedProfiles === 0) label = "NEEDS PROFILE";
  else if (!workerOnline) label = "WORKER OFFLINE";
  else label = "NOT LOADED";

  return { storedProfiles, runtimeLoaded, workerOnline, ready, label };
}
