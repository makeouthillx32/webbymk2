import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { getZoneContext } from "@/lib/zoneContext";
import {
  getPublicStorageObjectUrl,
  OPEN_GRAPH_HEIGHT,
  OPEN_GRAPH_WIDTH,
  siteOrigin,
} from "@/lib/siteOpenGraph";
import { getSiteIconUrls } from "@/lib/siteIcon";

type ZoneMetadataRow = {
  key: string;
  label: string;
  domain: string;
  description: string | null;
  og_image_bucket: string | null;
  og_image_path: string | null;
  og_image_alt: string | null;
  og_image_updated_at: string | null;
  site_icon_bucket: string | null;
  site_icon_path: string | null;
  site_icon_updated_at: string | null;
};

const CORE_ZONE_KEY = "unenter";

function hasOpenGraphImage(
  zone: ZoneMetadataRow | null | undefined,
): zone is ZoneMetadataRow {
  return Boolean(zone?.og_image_bucket && zone?.og_image_path);
}

function hasSiteIcon(
  zone: ZoneMetadataRow | null | undefined,
): zone is ZoneMetadataRow {
  return Boolean(zone?.site_icon_bucket && zone?.site_icon_path);
}

function titleCase(value: string) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateSiteMetadata(): Promise<Metadata> {
  const builtZone = process.env.NEXT_PUBLIC_ZONE?.trim();
  const context = builtZone ? null : await getZoneContext();
  const zoneKey = builtZone || context?.zone || "unenter";

  let zone: ZoneMetadataRow | null = null;
  let coreZone: ZoneMetadataRow | null = null;
  try {
    const databaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!databaseUrl || !serviceKey)
      throw new Error("Catalog connection unavailable");
    const admin = createClient(databaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await admin
      .from("zones")
      .select(
        "key,label,domain,description,og_image_bucket,og_image_path,og_image_alt,og_image_updated_at,site_icon_bucket,site_icon_path,site_icon_updated_at",
      )
      .in(
        "key",
        zoneKey === CORE_ZONE_KEY ? [CORE_ZONE_KEY] : [zoneKey, CORE_ZONE_KEY],
      );
    const rows = (data as ZoneMetadataRow[] | null) ?? [];
    zone = rows.find((row) => row.key === zoneKey) ?? null;
    coreZone = rows.find((row) => row.key === CORE_ZONE_KEY) ?? null;
  } catch {
    // Metadata must not take down a site when the catalog is temporarily unavailable.
  }

  const label =
    zone?.label || (zoneKey === "unenter" ? "Unenter" : titleCase(zoneKey));
  const origin = siteOrigin(zone?.domain || context?.canonicalHost);
  const description =
    zone?.description ||
    (zoneKey === "unenter"
      ? "Explore Unenter's projects, live streams, and community."
      : `Explore ${label} on Unenter.`);
  const imageZone = hasOpenGraphImage(zone)
    ? zone
    : hasOpenGraphImage(coreZone)
      ? coreZone
      : null;
  const imageUrl = getPublicStorageObjectUrl(
    imageZone?.og_image_bucket,
    imageZone?.og_image_path,
    imageZone?.og_image_updated_at,
  );
  const imageAlt = imageZone?.og_image_alt || `${label} preview`;
  const iconZone = hasSiteIcon(zone)
    ? zone
    : hasSiteIcon(coreZone)
      ? coreZone
      : null;
  const iconUrls = getSiteIconUrls(
    iconZone?.site_icon_bucket,
    iconZone?.site_icon_path,
    iconZone?.site_icon_updated_at,
  );
  const defaultTitle = zoneKey === "unenter" ? "Unenter" : `${label} | Unenter`;

  const images = imageUrl
    ? [
        {
          url: imageUrl,
          width: OPEN_GRAPH_WIDTH,
          height: OPEN_GRAPH_HEIGHT,
          alt: imageAlt,
        },
      ]
    : undefined;

  return {
    metadataBase: new URL(origin),
    title: {
      default: defaultTitle,
      template:
        zoneKey === "unenter" ? "%s | Unenter" : `%s | ${label} - Unenter`,
    },
    description,
    icons: {
      icon: iconUrls
        ? [
            { url: iconUrls.icon32, sizes: "32x32", type: "image/png" },
            { url: iconUrls.icon192, sizes: "192x192", type: "image/png" },
            { url: iconUrls.icon512, sizes: "512x512", type: "image/png" },
          ]
        : [
            {
              url: "/default-site-icon.png",
              sizes: "256x256",
              type: "image/png",
            },
          ],
      apple: [
        iconUrls
          ? {
              url: iconUrls.apple180,
              sizes: "180x180",
              type: "image/png",
            }
          : {
              url: "/default-site-icon.png",
              sizes: "256x256",
              type: "image/png",
            },
      ],
    },
    openGraph: {
      type: "website",
      url: origin,
      siteName: label,
      title: defaultTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}
