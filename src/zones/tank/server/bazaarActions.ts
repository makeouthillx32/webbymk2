"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ItemRarity } from "../itemRarity";
import { DEFAULT_MARKET_STATS, type MarketItemStat, type MarketListingView } from "../bazaarMarketData";

// No `export type {...}` re-export here on purpose: a "use server" file's
// codegen chokes on it exactly like it choked on the DEFAULT_MARKET_STATS
// const before that moved to bazaarMarketData.ts (see that file's header) —
// consumers import MarketItemStat/MarketListingView from bazaarMarketData
// directly instead.

export async function getMarketListings({
  search = "",
  rarity = "all",
  sort = "newest",
}: {
  search?: string;
  rarity?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "ending_soon";
} = {}): Promise<MarketListingView[]> {
  try {
    const admin = createAdminClient();
    let query = admin
      .from("tank_market_listings")
      .select(`
        id,
        seller_user_id,
        item_id,
        quantity,
        start_bid,
        current_bid,
        highest_bidder_user_id,
        buyout_price,
        status,
        expires_at,
        created_at,
        tank_inventory_items (
          slug,
          name,
          rarity,
          icon_url
        ),
        profiles:seller_user_id (
          display_name
        )
      `)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());

    if (sort === "price_asc") {
      query = query.order("buyout_price", { ascending: true, nullsFirst: false });
    } else if (sort === "price_desc") {
      query = query.order("buyout_price", { ascending: false });
    } else if (sort === "ending_soon") {
      query = query.order("expires_at", { ascending: true });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;
    if (error || !data) return [];

    let listings: MarketListingView[] = data.map((row: any) => {
      const item = Array.isArray(row.tank_inventory_items) ? row.tank_inventory_items[0] : row.tank_inventory_items;
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        sellerUserId: row.seller_user_id,
        sellerName: profile?.display_name || "Anonymous",
        itemId: row.item_id,
        itemSlug: item?.slug || "unknown",
        itemName: item?.name || "Mysterious Item",
        itemIconUrl: item?.icon_url || "/images/tank-items/battery.png",
        itemRarity: (item?.rarity as ItemRarity) || "common",
        quantity: row.quantity,
        startBid: row.start_bid,
        currentBid: row.current_bid,
        highestBidderUserId: row.highest_bidder_user_id,
        buyoutPrice: row.buyout_price,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      };
    });

    if (search.trim()) {
      const term = search.toLowerCase();
      listings = listings.filter((l) =>
        l.itemName.toLowerCase().includes(term) || l.sellerName.toLowerCase().includes(term)
      );
    }

    if (rarity && rarity !== "all") {
      listings = listings.filter((l) => l.itemRarity === rarity);
    }

    return listings;
  } catch {
    return [];
  }
}

export async function createMarketListingAction({
  itemSlug,
  quantity = 1,
  startBid = 1,
  buyoutPrice = null,
  durationHours = 24,
}: {
  itemSlug: string;
  quantity?: number;
  startBid?: number;
  buyoutPrice?: number | null;
  durationHours?: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in to list items in the Bazaar." };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("tank_create_market_listing", {
      p_user_id: user.id,
      p_item_slug: itemSlug,
      p_quantity: quantity,
      p_start_bid: startBid,
      p_buyout_price: buyoutPrice,
      p_duration_hours: durationHours,
    });

    if (error) return { success: false, error: error.message };
    return (data ?? { success: false, error: "No response from Bazaar server." }) as any;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create listing.",
    };
  }
}

export async function buyoutMarketListingAction(listingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in to buyout items." };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("tank_buyout_market_listing", {
      p_buyer_user_id: user.id,
      p_listing_id: listingId,
    });

    if (error) return { success: false, error: error.message };
    return (data ?? { success: false, error: "Buyout failed." }) as any;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to execute buyout.",
    };
  }
}

export async function bidMarketListingAction({
  listingId,
  bidAmount,
}: {
  listingId: string;
  bidAmount: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in to place bids." };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("tank_bid_market_listing", {
      p_bidder_user_id: user.id,
      p_listing_id: listingId,
      p_bid_amount: bidAmount,
    });

    if (error) return { success: false, error: error.message };
    return (data ?? { success: false, error: "Bid failed." }) as any;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to place bid.",
    };
  }
}

export async function getMarketStatsAction(): Promise<MarketItemStat[]> {
  return DEFAULT_MARKET_STATS;
}
