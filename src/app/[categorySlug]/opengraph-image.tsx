// app/[categorySlug]/opengraph-image.tsx
//
// Next.js automatically wires this to og:image + twitter:image meta tags for
// every page under this route segment — no manual metadata config needed.
//
// Labs-specific rule: when picking which image represents a product on the
// social preview card, lab-report scans (image_type === "lab_report" on any
// variant) are excluded — only real product photos are eligible. Composited
// at the correct 1200x630 OG size regardless of the source photo's native
// dimensions (contain-fit into a fixed panel, not a raw/cropped original).

import { ImageResponse } from "next/og";
import { createServerClient as createSupabaseClient } from "@supabase/ssr";
import { getResearchProductBySlug, getResearchCategoryBySlug } from "@/lib/research/queries";
import { getResearchProductOgImage } from "@/lib/images";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fallbackCard(title: string, subtitle?: string | null) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0d10",
        }}
      >
        <div style={{ display: "flex", color: "white", fontSize: 54, fontWeight: 700 }}>{title}</div>
        {subtitle && (
          <div style={{ display: "flex", color: "rgba(255,255,255,0.6)", fontSize: 20, marginTop: 14 }}>
            {subtitle}
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}

export default async function OGImage({ params }: { params: Promise<{ categorySlug: string }> }) {
  const { categorySlug } = await params;

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );

  const category = await getResearchCategoryBySlug(supabase, categorySlug);
  if (category) {
    return fallbackCard(category.name, "Unenter Labs — Research Chemical Category");
  }

  const product = await getResearchProductBySlug(supabase, categorySlug);
  if (!product) {
    return fallbackCard("Unenter Labs");
  }

  const photoUrl = getResearchProductOgImage(product);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b0d10" }}>
        {/* Photo panel — fixed 630x630 square, contain-fit so nothing gets
            cropped and transparent cutout photos blend cleanly against the
            dark panel behind them. */}
        <div
          style={{
            width: 630,
            height: 630,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#15181d",
          }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              width={560}
              height={560}
              style={{ objectFit: "contain", width: 560, height: 560 }}
            />
          ) : (
            <div style={{ display: "flex", fontSize: 140, color: "rgba(255,255,255,0.15)" }}>⚗</div>
          )}
        </div>

        {/* Text panel */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "48px 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#7dd3fc",
              fontSize: 15,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            Unenter Labs
          </div>
          <div
            style={{
              display: "flex",
              color: "white",
              fontSize: 46,
              fontWeight: 700,
              lineHeight: 1.15,
              maxWidth: 520,
              marginBottom: 20,
            }}
          >
            {product.title}
          </div>
          <div style={{ display: "flex", color: "rgba(255,255,255,0.55)", fontSize: 18 }}>
            Research Use Only · Third-Party Tested
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
