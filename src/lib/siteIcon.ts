import { getPublicStorageObjectUrl } from "@/lib/siteOpenGraph";

export const SITE_ICON_MIN_SOURCE_SIZE = 128;

export const SITE_ICON_VARIANTS = [
  { key: "icon32", fileName: "icon-32.png", size: 32 },
  { key: "apple180", fileName: "apple-touch-icon-180.png", size: 180 },
  { key: "icon192", fileName: "icon-192.png", size: 192 },
  { key: "icon512", fileName: "icon-512.png", size: 512 },
] as const;

export type SiteIconUrls = Record<
  (typeof SITE_ICON_VARIANTS)[number]["key"],
  string
>;

export function getSiteIconObjectPaths(pathPrefix: string): string[] {
  const cleanPrefix = pathPrefix.replace(/\/+$/, "");
  return SITE_ICON_VARIANTS.map(
    (variant) => `${cleanPrefix}/${variant.fileName}`,
  );
}

export function getSiteIconUrls(
  bucket: string | null | undefined,
  pathPrefix: string | null | undefined,
  version?: string | null,
): SiteIconUrls | null {
  if (!bucket || !pathPrefix) return null;

  const entries = SITE_ICON_VARIANTS.map((variant) => [
    variant.key,
    getPublicStorageObjectUrl(
      bucket,
      `${pathPrefix.replace(/\/+$/, "")}/${variant.fileName}`,
      version,
    ),
  ]);

  if (entries.some(([, url]) => !url)) return null;
  return Object.fromEntries(entries) as SiteIconUrls;
}
