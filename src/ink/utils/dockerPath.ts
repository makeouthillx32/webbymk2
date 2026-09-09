/**
 * Convert a WSL DrvFs path for a Windows Docker CLI wrapper. Native Linux
 * Docker must continue receiving Linux paths unchanged.
 */
export function dockerCliHostPath(
  input: string,
  runtime: { platform?: NodeJS.Platform; isWsl?: boolean } = {},
): string {
  const platform = runtime.platform ?? process.platform;
  const isWsl = runtime.isWsl ?? Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
  if (platform !== "linux" || !isWsl) return input;

  const match = input.match(/^\/mnt\/([a-zA-Z])(?:\/(.*))?$/);
  if (!match) return input;
  const suffix = match[2] ? `\\${match[2].replaceAll("/", "\\")}` : "";
  return `${match[1].toUpperCase()}:${suffix}`;
}
