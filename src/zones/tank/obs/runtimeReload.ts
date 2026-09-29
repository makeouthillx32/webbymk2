export type ObsRuntimeHealth = {
  ok: boolean;
  buildId: string | null;
  serverStartedAt?: string;
  checkedAt?: string;
};

export function shouldReloadForBuildChange(
  documentBuildId: string | null | undefined,
  serverBuildId: string | null | undefined,
): boolean {
  return Boolean(
    documentBuildId &&
      serverBuildId &&
      documentBuildId !== serverBuildId,
  );
}

export function buildRuntimeRefreshUrl(currentUrl: string, serverBuildId: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("_tank_build", serverBuildId);
  return url.toString();
}
