// src/app/dashboard/[id]/settings/sites/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Sites & Apps catalog with dashboard-owned OpenGraph asset management.
//
// Server component: admin-gated via requireAdmin() (redirects non-admins — the
// authorization is enforced HERE, server-side; the sidebar item is convenience,
// not security). Reads the catalog through the server-only service-role client
// because public.zones + catalog tables are RLS-locked to service_role.
//
// Public/Runtime/Agent signals remain independent columns and fill in as the
// probe and runtime-projection tables are populated.
// ─────────────────────────────────────────────────────────────────────────────

import { requireAdmin } from "@/lib/adminGuard";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPublicStorageObjectUrl } from "@/lib/siteOpenGraph";
import { getSiteIconUrls } from "@/lib/siteIcon";
import OpenGraphImageManager from "./OpenGraphImageManager";
import SiteIconManager from "./SiteIconManager";
import styles from "./sites.module.css";

export const dynamic = "force-dynamic";

type ZoneRow = {
  key: string;
  label: string | null;
  domain: string | null;
  visibility: "private" | "unlisted" | "public";
  lifecycle_state: "active" | "missing" | "archived";
  show_in_footer: boolean;
  og_image_bucket: string | null;
  og_image_path: string | null;
  og_image_alt: string | null;
  og_image_updated_at: string | null;
  og_image_width: number | null;
  og_image_height: number | null;
  og_image_bytes: number | null;
  og_image_mime_type: string | null;
  og_image_original_name: string | null;
  og_image_source_width: number | null;
  og_image_source_height: number | null;
  site_icon_bucket: string | null;
  site_icon_path: string | null;
  site_icon_updated_at: string | null;
  site_icon_original_name: string | null;
  site_icon_source_width: number | null;
  site_icon_source_height: number | null;
  site_icon_bytes: number | null;
  environment_id: string | null;
  enabled: boolean;
  updated_at: string | null;
};

// Interim environment naming until managed_environments/zone_deployments are
// populated by the sync phase. Only L0V3 currently carries an env id; null = POWER.
const L0V3_ENV_ID = "052a307d-7d3e-4508-bda1-fa545d2dbb13";
function envLabel(environmentId: string | null): string {
  if (!environmentId) return "POWER";
  if (environmentId === L0V3_ENV_ID) return "L0V3";
  return "—";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default async function SitesPage() {
  await requireAdmin(); // redirects if not an admin — authorization lives here

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("zones")
    .select(
      "key,label,domain,visibility,lifecycle_state,show_in_footer,og_image_bucket,og_image_path,og_image_alt,og_image_updated_at,og_image_width,og_image_height,og_image_bytes,og_image_mime_type,og_image_original_name,og_image_source_width,og_image_source_height,site_icon_bucket,site_icon_path,site_icon_updated_at,site_icon_original_name,site_icon_source_width,site_icon_source_height,site_icon_bytes,environment_id,enabled,updated_at",
    )
    .order("sort_order", { ascending: true });

  const zones = (data ?? []) as ZoneRow[];
  const coreZone = zones.find((zone) => zone.key === "unenter") ?? null;
  const coreImageUrl = getPublicStorageObjectUrl(
    coreZone?.og_image_bucket,
    coreZone?.og_image_path,
    coreZone?.og_image_updated_at,
  );
  const coreIconUrls = getSiteIconUrls(
    coreZone?.site_icon_bucket,
    coreZone?.site_icon_path,
    coreZone?.site_icon_updated_at,
  );
  const publicCount = zones.filter((z) => z.visibility === "public").length;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Sites &amp; Apps</h1>
          <p className={styles.sub}>
            Social previews, visibility, and runtime context for every site.
          </p>
        </div>
        <div className={styles.counts}>
          <span className={styles.countPill}>{zones.length} total</span>
          <span className={`${styles.countPill} ${styles.countPublic}`}>
            {publicCount} public
          </span>
        </div>
      </header>

      {error && (
        <div className={styles.error}>
          Couldn&apos;t load the catalog: {error.message}
        </div>
      )}

      <div
        className={styles.tableWrap}
        role="region"
        aria-label="Sites and apps"
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Site</th>
              <th scope="col">Domain</th>
              <th scope="col">Open Graph</th>
              <th scope="col">Site icon</th>
              <th scope="col">Environment</th>
              <th scope="col">Public</th>
              <th scope="col">Runtime</th>
              <th scope="col">Agent</th>
              <th scope="col">Visibility</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.key}>
                <th scope="row" className={styles.siteCell}>
                  <span className={styles.siteLabel}>{z.label || z.key}</span>
                  <span className={styles.siteKey}>{z.key}</span>
                </th>
                <td>
                  {z.domain ? (
                    <span className={styles.domain}>{z.domain}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <OpenGraphImageManager
                    zoneKey={z.key}
                    label={z.label || z.key}
                    imageUrl={getPublicStorageObjectUrl(
                      z.og_image_bucket,
                      z.og_image_path,
                      z.og_image_updated_at,
                    )}
                    imageAlt={z.og_image_alt}
                    bucket={z.og_image_bucket}
                    objectPath={z.og_image_path}
                    updatedAt={z.og_image_updated_at}
                    width={z.og_image_width}
                    height={z.og_image_height}
                    bytes={z.og_image_bytes}
                    mimeType={z.og_image_mime_type}
                    originalName={z.og_image_original_name}
                    sourceWidth={z.og_image_source_width}
                    sourceHeight={z.og_image_source_height}
                    inheritedImageUrl={
                      z.key !== "unenter" ? coreImageUrl : null
                    }
                    inheritedImageAlt={
                      z.key !== "unenter"
                        ? (coreZone?.og_image_alt ?? null)
                        : null
                    }
                    inheritedFromLabel={
                      z.key !== "unenter" ? coreZone?.label || "Unenter" : null
                    }
                  />
                </td>
                <td>
                  <SiteIconManager
                    zoneKey={z.key}
                    label={z.label || z.key}
                    imageUrl={
                      getSiteIconUrls(
                        z.site_icon_bucket,
                        z.site_icon_path,
                        z.site_icon_updated_at,
                      )?.icon192 ?? null
                    }
                    bucket={z.site_icon_bucket}
                    objectPath={z.site_icon_path}
                    updatedAt={z.site_icon_updated_at}
                    originalName={z.site_icon_original_name}
                    sourceWidth={z.site_icon_source_width}
                    sourceHeight={z.site_icon_source_height}
                    bytes={z.site_icon_bytes}
                    inheritedImageUrl={
                      z.key !== "unenter"
                        ? coreIconUrls?.icon192 || "/default-site-icon.png"
                        : "/default-site-icon.png"
                    }
                    inheritedFromLabel={
                      z.key !== "unenter"
                        ? coreZone?.label || "Unenter"
                        : "Packaged default"
                    }
                  />
                </td>
                <td>{envLabel(z.environment_id)}</td>
                {/* Public / Runtime / Agent are populated by later phases
                    (probes + runtime projection). Show a neutral placeholder. */}
                <td>
                  <span className={styles.dim}>unknown</span>
                </td>
                <td>
                  <span className={styles.dim}>—</span>
                </td>
                <td>
                  <span className={styles.dim}>—</span>
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${
                      z.visibility === "public"
                        ? styles.badgePublic
                        : z.visibility === "unlisted"
                          ? styles.badgeUnlisted
                          : styles.badgePrivate
                    }`}
                  >
                    {z.visibility}
                  </span>
                  {z.lifecycle_state !== "active" && (
                    <span className={styles.lifecycle}>
                      {z.lifecycle_state}
                    </span>
                  )}
                </td>
                <td>{fmtDate(z.updated_at)}</td>
              </tr>
            ))}
            {zones.length === 0 && !error && (
              <tr>
                <td colSpan={10} className={styles.empty}>
                  No sites in the catalog yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        Public / Runtime / Agent are shown separately by design — a site can be
        publicly reachable while its agent is offline, and vice-versa. Those
        signals light up as endpoint probes and runtime observations come
        online.
      </p>
    </div>
  );
}
