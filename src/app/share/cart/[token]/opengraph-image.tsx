// app/share/cart/[token]/opengraph-image.tsx
// Next.js automatically wires this to og:image + twitter:image meta tags.
// No manual metadata configuration needed — just drop this file in the route folder.

import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function OGImage({ params }: PageProps) {
  const { token } = await params;

  // Service role bypasses RLS — safe because this is a read-only server render
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: cart } = await supabase
    .from("carts")
    .select(`
      share_name,
      share_message,
      share_expires_at,
      share_enabled,
      cart_items (
        quantity,
        price_cents,
        products ( title )
      )
    `)
    .eq("share_token", token)
    .eq("share_enabled", true)
    .single();

  // Graceful fallbacks for missing / expired carts
  const shareName = cart?.share_name ?? "A Desert Cowgirl Wishlist";
  const shareMessage = cart?.share_message ?? null;
  const items: any[] = cart?.cart_items ?? [];
  const isExpired =
    !!cart?.share_expires_at && new Date(cart.share_expires_at) < new Date();

  const itemCount = items.reduce((s, i) => s + (i.quantity ?? 1), 0);
  const subtotalCents = items.reduce(
    (s, i) => s + (i.price_cents ?? 0) * (i.quantity ?? 1),
    0
  );
  const subtotalFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(subtotalCents / 100);

  // Up to 4 product name pills
  const previewTitles: string[] = items
    .slice(0, 4)
    .map((i) => i.products?.title ?? "Item")
    .filter(Boolean);

  const extraCount = Math.max(0, items.length - 4);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          fontFamily: "Georgia, 'Times New Roman', serif",
          background:
            "linear-gradient(135deg, #78350f 0%, #92400e 38%, #b45309 72%, #d97706 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Large background star watermark */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 520,
            color: "rgba(255,255,255,0.05)",
            lineHeight: 1,
            userSelect: "none",
            display: "flex",
          }}
        >
          ✦
        </div>

        {/* Corner accents */}
        <div style={{ position: "absolute", top: 28, left: 36, fontSize: 56, color: "rgba(255,255,255,0.12)", display: "flex" }}>✦</div>
        <div style={{ position: "absolute", top: 36, right: 44, fontSize: 40, color: "rgba(255,255,255,0.12)", display: "flex" }}>✦</div>
        <div style={{ position: "absolute", bottom: 28, right: 36, fontSize: 52, color: "rgba(255,255,255,0.10)", display: "flex" }}>✦</div>

        {/* Main card */}
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 40,
            bottom: 40,
            left: 40,
            background: "rgba(255,255,255,0.09)",
            border: "1px solid rgba(255,255,255,0.20)",
            borderRadius: 24,
            display: "flex",
            flexDirection: "column",
            padding: "48px 56px 44px",
          }}
        >
          {/* Brand + badge row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <div
              style={{
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.28)",
                borderRadius: 100,
                padding: "7px 20px",
                color: "rgba(255,255,255,0.92)",
                fontSize: 14,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                display: "flex",
              }}
            >
              ✦ Desert Cowgirl Co. ✦
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: 100,
                padding: "7px 18px",
                color: "rgba(255,255,255,0.82)",
                fontSize: 13,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                display: "flex",
              }}
            >
              🎁 Shared Wishlist
            </div>
          </div>

          {/* Wishlist title */}
          <div
            style={{
              color: "white",
              fontSize: 56,
              fontWeight: "bold",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              maxWidth: 780,
              marginBottom: shareMessage && !isExpired ? 16 : 24,
              display: "flex",
            }}
          >
            {shareName}
          </div>

          {/* Share message */}
          {shareMessage && !isExpired && (
            <div
              style={{
                color: "rgba(255,255,255,0.78)",
                fontSize: 22,
                fontStyle: "italic",
                lineHeight: 1.45,
                maxWidth: 700,
                marginBottom: 24,
                display: "flex",
              }}
            >
              &ldquo;{shareMessage}&rdquo;
            </div>
          )}

          {/* Expired notice */}
          {isExpired && (
            <div
              style={{
                color: "rgba(255,255,255,0.60)",
                fontSize: 20,
                fontStyle: "italic",
                marginBottom: 24,
                display: "flex",
              }}
            >
              This wishlist has expired.
            </div>
          )}

          {/* Product name pills */}
          {previewTitles.length > 0 && !isExpired && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
              {previewTitles.map((title, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "rgba(255,255,255,0.13)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    borderRadius: 100,
                    padding: "8px 20px",
                    color: "rgba(255,255,255,0.90)",
                    fontSize: 15,
                    maxWidth: 250,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "flex",
                  }}
                >
                  {title}
                </div>
              ))}
              {extraCount > 0 && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: 100,
                    padding: "8px 18px",
                    color: "rgba(255,255,255,0.65)",
                    fontSize: 15,
                    display: "flex",
                  }}
                >
                  +{extraCount} more
                </div>
              )}
            </div>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Bottom stats bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(255,255,255,0.18)",
              paddingTop: 24,
            }}
          >
            <div style={{ display: "flex", gap: 40 }}>
              {/* Item count */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    display: "flex",
                  }}
                >
                  Items
                </span>
                <span
                  style={{ color: "white", fontSize: 30, fontWeight: "bold", display: "flex" }}
                >
                  {itemCount}
                </span>
              </div>

              {/* Subtotal */}
              {subtotalCents > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      display: "flex",
                    }}
                  >
                    Total
                  </span>
                  <span
                    style={{
                      color: "white",
                      fontSize: 30,
                      fontWeight: "bold",
                      display: "flex",
                    }}
                  >
                    {subtotalFormatted}
                  </span>
                </div>
              )}
            </div>

            {/* Domain watermark */}
            <div
              style={{
                color: "rgba(255,255,255,0.45)",
                fontSize: 15,
                fontStyle: "italic",
                display: "flex",
              }}
            >
              desertcowgirl.co
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}