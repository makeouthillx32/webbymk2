// app/share/cart/[token]/page.tsx
// Server component — fetches cart data, generates metadata, passes to client.

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@/utils/supabase/server";
import SharedCartClient from "./_components/SharedCartClient";

interface PageProps {
  params: Promise<{ token: string }>;
}

// ─── Shared data fetcher ──────────────────────────────────────────────────────

async function getSharedCart(token: string) {
  const supabase = await createServerClient();

  const { data: cart, error } = await supabase
    .from("carts")
    .select(`
      id,
      share_name,
      share_message,
      share_expires_at,
      share_enabled,
      cart_items (
        id,
        quantity,
        price_cents,
        added_note,
        products (
          id,
          title,
          slug,
          product_images (
            bucket_name,
            object_path,
            alt_text,
            is_primary,
            sort_order,
            position
          )
        ),
        product_variants (
          id,
          title,
          sku,
          options
        )
      )
    `)
    .eq("share_token", token)
    .eq("share_enabled", true)
    .single();

  if (error || !cart) return null;

  if (cart.share_expires_at && new Date(cart.share_expires_at) < new Date()) {
    return null;
  }

  return cart;
}

// ─── generateMetadata ─────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const cart = await getSharedCart(token);

  if (!cart) {
    return { title: "Wishlist Not Found | Desert Cowgirl Co." };
  }

  const shareName = cart.share_name ?? "A Desert Cowgirl Wishlist";
  const shareMessage = cart.share_message ?? "Check out this wishlist from Desert Cowgirl Co.!";
  const itemCount = (cart.cart_items ?? []).reduce(
    (sum: number, item: any) => sum + (item.quantity ?? 1),
    0
  );
  const description = `${shareMessage} · ${itemCount} item${itemCount !== 1 ? "s" : ""} inside.`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertcowgirl.co";

  return {
    title: `${shareName} | Desert Cowgirl Co.`,
    description,
    metadataBase: new URL(siteUrl),
    openGraph: {
      title: `${shareName} | Desert Cowgirl Co.`,
      description,
      url: `${siteUrl}/share/cart/${token}`,
      siteName: "Desert Cowgirl Co.",
      type: "website",
      // opengraph-image.tsx in this same folder is picked up automatically
    },
    twitter: {
      card: "summary_large_image",
      title: `${shareName} | Desert Cowgirl Co.`,
      description,
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharedCartPage({ params }: PageProps) {
  const { token } = await params;
  const cart = await getSharedCart(token);

  if (!cart) notFound();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const items = (cart.cart_items ?? []).map((item: any) => {
    const images: any[] = item.products?.product_images ?? [];

    const primary =
      images.find((i: any) => i.is_primary) ??
      [...images].sort(
        (a: any, b: any) =>
          (a.sort_order ?? a.position ?? 999) - (b.sort_order ?? b.position ?? 999)
      )[0] ??
      null;

    const imageUrl =
      primary?.bucket_name && primary?.object_path
        ? `${supabaseUrl}/storage/v1/object/public/${primary.bucket_name}/${primary.object_path}`
        : null;

    return {
      id: item.id,
      variant_id: item.product_variants?.id ?? null,
      quantity: item.quantity ?? 1,
      price_cents: item.price_cents ?? 0,
      added_note: item.added_note ?? null,
      product_title: item.products?.title ?? "Unknown Product",
      product_slug: item.products?.slug ?? "",
      variant_title: item.product_variants?.title ?? null,
      variant_sku: item.product_variants?.sku ?? null,
      options: item.product_variants?.options ?? null,
      image_url: imageUrl,
      image_alt: primary?.alt_text ?? item.products?.title ?? "Product image",
    };
  });

  const subtotalCents = items.reduce(
    (sum: number, item: any) => sum + item.price_cents * item.quantity,
    0
  );

  return (
    <SharedCartClient
      token={token}
      shareName={cart.share_name ?? "Wishlist"}
      shareMessage={cart.share_message ?? null}
      items={items}
      subtotalCents={subtotalCents}
    />
  );
}