// app/products/[slug]/opengraph-image.tsx

import { ImageResponse } from "next/og";
import { createServerClient } from "@/utils/supabase/server";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://efglhzzageijqhfwvsub.supabase.co";

type RawImage = {
  bucket_name: string | null;
  object_path: string | null;
  is_primary: boolean | null;
  is_public: boolean | null;
  sort_order: number | null;
  position: number | null;
};

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function buildStorageUrl(img: RawImage | null): string | null {
  if (!img?.bucket_name || !img?.object_path) return null;

  const encodedPath = encodeStoragePath(img.object_path);

  return `${SUPABASE_URL}/storage/v1/object/public/${img.bucket_name}/${encodedPath}`;
}

function buildTransformedOgImageUrl(img: RawImage | null): string | null {
  if (!img?.bucket_name || !img?.object_path) return null;

  const encodedPath = encodeStoragePath(img.object_path);

  const params = new URLSearchParams({
    width: "1200",
    height: "1200",
    resize: "contain",
    quality: "70",
    format: "origin",
  });

  return `${SUPABASE_URL}/storage/v1/render/image/public/${img.bucket_name}/${encodedPath}?${params.toString()}`;
}

function pickPrimaryImage(images: RawImage[]): RawImage | null {
  if (!images?.length) return null;

  const pub = images.filter((i) => i.is_public ?? true);
  const arr = pub.length ? pub : images;

  const primary = arr.find((i) => i.is_primary);
  if (primary) return primary;

  return (
    [...arr].sort((a, b) => {
      const as = a.sort_order ?? a.position ?? 999999;
      const bs = b.sort_order ?? b.position ?? 999999;
      return as - bs;
    })[0] ?? null
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerClient();

  const { data: product } = await supabase
    .from("products")
    .select(`
      title,
      slug,
      price_cents,
      badge,
      product_images (
        bucket_name,
        object_path,
        is_primary,
        is_public,
        sort_order,
        position
      )
    `)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  const title = product?.title ?? "Shop Desert Cowgirl";
  const price = product?.price_cents
    ? `$${(product.price_cents / 100).toFixed(2)}`
    : null;
  const badge = product?.badge ?? null;

  const primaryImg = pickPrimaryImage(product?.product_images ?? []);

  // Use transformed image first for reliability in OG rendering.
  const imageUrl =
    buildTransformedOgImageUrl(primaryImg) ?? buildStorageUrl(primaryImg);

  const sand = "#F5E6C8";
  const rust = "#C0522A";
  const darkBrown = "#2C1810";
  const warmWhite = "#FDF8F0";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: warmWhite,
          position: "relative",
          overflow: "hidden",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 40px,
              rgba(192, 82, 42, 0.035) 40px,
              rgba(192, 82, 42, 0.035) 41px
            )`,
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 52px",
            flex: imageUrl ? "0 0 548px" : "1",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: rust,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    background: warmWhite,
                    borderRadius: "50%",
                    display: "flex",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: rust,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Desert Cowgirl
              </span>
            </div>
            <div
              style={{
                width: 48,
                height: 2,
                background: rust,
                marginTop: 14,
                display: "flex",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {badge && (
              <div style={{ display: "flex" }}>
                <span
                  style={{
                    background: rust,
                    color: warmWhite,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    padding: "5px 16px",
                    borderRadius: 4,
                  }}
                >
                  {badge}
                </span>
              </div>
            )}
            <div
              style={{
                fontSize: imageUrl ? 40 : 50,
                fontWeight: 800,
                color: darkBrown,
                lineHeight: 1.15,
                maxWidth: 430,
              }}
            >
              {title}
            </div>
            {price && (
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: rust,
                }}
              >
                {price}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: darkBrown,
                color: warmWhite,
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "13px 26px",
                borderRadius: 8,
                alignSelf: "flex-start",
              }}
            >
              Shop Now
            </div>
            <span
              style={{
                fontSize: 12,
                color: "rgba(44, 24, 16, 0.45)",
                marginTop: 4,
              }}
            >
              desertcowgirl.co/products/{slug}
            </span>
          </div>
        </div>

        {imageUrl && (
          <div
            style={{
              flex: 1,
              display: "flex",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 80,
                height: "100%",
                background: `linear-gradient(to right, ${warmWhite}, transparent)`,
                zIndex: 2,
                display: "flex",
              }}
            />
            <img
              src={imageUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center top",
              }}
            />
          </div>
        )}

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: `linear-gradient(to right, ${rust}, ${darkBrown})`,
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}