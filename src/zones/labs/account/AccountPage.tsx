// src/zones/labs/account/AccountPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unenter Labs · researcher account area · labs.unenter.live/account
//
// Routed ONLY in the labs image, via the zone overlay wrapper at
//   zones/labs/src/app/account/page.tsx
//
// Structured after specialized peptide portals (Ascension Peptides / Ion Peptide).
// Completely isolated from Tank (no Tank avatars, no cross-zone references).
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getZoneBaseUrl } from "@/lib/multiZone";
import { ShieldEntryGate } from "@/components/shield";
import { getLabResultsLibrary } from "@/lib/research/queries";
import LabsAccountPortal, {
  ResearchOrder,
  WaitlistItem,
  AccountProfile,
  AddressBookEntry,
  TabKey,
} from "./LabsAccountPortal";
import { buildCoasFromDb } from "./coa-mapper";

const ZONE_LABEL = "Unenter Labs";

export const metadata: Metadata = {
  title: `Account | ${ZONE_LABEL}`,
  description: "Your Unenter Labs research account — orders, compound waitlist, and fulfillment details.",
};

export const dynamic = "force-dynamic";

const ACCOUNT_TABS = new Set<TabKey>([
  "dashboard", "orders", "coa", "waitlist", "addresses", "account_details",
]);

export default async function LabsAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab: TabKey = requestedTab && ACCOUNT_TABS.has(requestedTab as TabKey)
    ? requestedTab as TabKey
    : "dashboard";
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (!user?.id) {
    const accountPath = initialTab === "dashboard" ? "/account" : `/account?tab=${initialTab}`;
    const back = encodeURIComponent(`https://labs.unenter.live${accountPath}`);
    redirect(`${getZoneBaseUrl("auth")}/sign-in?redirect_to=${back}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, first_name, last_name, avatar_url, email, region, role, " +
        "research_terms_accepted_at, created_at"
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    return (
      <main className="container py-20">
        <p className="text-center text-[hsl(var(--muted-foreground))]">
          We couldn&apos;t load your profile. Try signing out and back in.
        </p>
      </main>
    );
  }

  // Isolate Labs: never leak Tank avatars
  const safeProfile: AccountProfile = {
    id: profile.id,
    display_name: profile.display_name,
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email ?? user.email ?? null,
    region: profile.region,
    research_terms_accepted_at: profile.research_terms_accepted_at,
    created_at: profile.created_at,
  };

  // Explicit user scoping for research orders
  const { data: ordersData } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, payment_status, total_cents, subtotal_cents,
       discount_cents, shipping_cents, tax_cents, currency, created_at, shipped_at, delivered_at,
       tracking_number, tracking_url, shipping_method_name, customer_notes,
       payment_method_brand, payment_method_last4, shipping_address, billing_address,
       order_items ( id, product_title, variant_title, sku, quantity, price_cents, currency, allocated_batch_id, research_product_id )`
    )
    .eq("order_source", "research")
    .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id},profile_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const orders = (ordersData ?? []) as unknown as ResearchOrder[];

  // Compound waitlist from research_stock_notifications
  const { data: waitlistData } = await supabase
    .from("research_stock_notifications")
    .select(
      `id, created_at, notified_at,
       research_product:research_products ( id, title, slug, price_cents, dosage_label, brand, cas_number, purity_percent, status )`
    )
    .or(`user_id.eq.${user.id},email.eq.${user.email ?? ""}`)
    .order("created_at", { ascending: false });

  const waitlist = (waitlistData ?? []) as unknown as WaitlistItem[];

  // Active research cart
  const { data: cart } = await supabase
    .from("research_carts")
    .select("id, status, updated_at, research_cart_items ( id, quantity )")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const cartCount =
    (cart?.research_cart_items as { quantity: number | null }[] | null)?.reduce(
      (sum, i) => sum + (i.quantity ?? 0),
      0
    ) ?? 0;

  // Saved Address Book
  const { data: addressBookData } = await supabase
    .from("user_address_book")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default_shipping", { ascending: false })
    .order("created_at", { ascending: true });

  const addressBook = (addressBookData ?? []) as unknown as AddressBookEntry[];

  // Verified Database COAs & Batches
  const labLibrary = await getLabResultsLibrary(supabase);
  const initialCoas = buildCoasFromDb(labLibrary, orders);

  return (
    <ShieldEntryGate zoneTitle={ZONE_LABEL}>
      <LabsAccountPortal
        initialProfile={safeProfile}
        initialOrders={orders}
        initialWaitlist={waitlist}
        initialAddressBook={addressBook}
        initialCoas={initialCoas}
        cartCount={cartCount}
        initialTab={initialTab}
      />
    </ShieldEntryGate>
  );
}
