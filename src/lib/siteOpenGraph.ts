export const SITE_ASSET_BUCKET = "site-assets";
export const OPEN_GRAPH_WIDTH = 1200;
export const OPEN_GRAPH_HEIGHT = 630;
export const OPEN_GRAPH_MAX_BYTES = 8 * 1024 * 1024;

export function getPublicStorageObjectUrl(
  bucket: string | null | undefined,
  objectPath: string | null | undefined,
  version?: string | null,
): string | null {
  if (!bucket || !objectPath) return null;

  const baseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
  if (!baseUrl) return null;

  const encodedPath = objectPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const cacheVersion = version ? `?v=${encodeURIComponent(version)}` : "";

  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}${cacheVersion}`;
}

export function siteOrigin(domain: string | null | undefined): string {
  if (!domain) return "https://unenter.live";
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}
