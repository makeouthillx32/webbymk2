type TankIdentitySources = {
  tankDisplayName?: unknown;
  coreDisplayName?: unknown;
  localDisplayName?: unknown;
  authDisplayName?: unknown;
  providerFullName?: unknown;
  providerUserName?: unknown;
  email?: string | null;
  fallback?: string;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Tank-owned identity always outranks Google/Facebook presentation metadata. */
export function resolveTankDisplayName(sources: TankIdentitySources): string {
  return (
    clean(sources.localDisplayName) ||
    clean(sources.tankDisplayName) ||
    clean(sources.coreDisplayName) ||
    clean(sources.authDisplayName) ||
    clean(sources.providerFullName) ||
    clean(sources.providerUserName) ||
    clean(sources.email?.split("@")[0]) ||
    sources.fallback ||
    "Viewer"
  );
}
