// app/api/research-checkout/shipping-rates/route.ts
//
// Mirrors /api/checkout/shipping-rates but checks weight against
// research_cart_items -> research_product_variants instead of the shop
// cart tables. Same USPS-live / flat-DB-rate fallback logic.
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getOAuthToken } from "@/lib/usps/tokens";

const USPS_ENV = process.env.USPS_ENV ?? "mock";
const USPS_BASE = USPS_ENV === "production"
  ? "https://apis.usps.com"
  : "https://apis-tem.usps.com";

const FREE_THRESHOLD_CENTS = Number(process.env.FREE_SHIPPING_THRESHOLD_CENTS ?? 7500);

function isLiveMode(): boolean {
  return !!(
    process.env.USPS_CONSUMER_KEY &&
    process.env.USPS_CONSUMER_SECRET &&
    process.env.USPS_ENV !== "mock"
  );
}

const MAIL_CLASSES = [
  { mailClass: "USPS_GROUND_ADVANTAGE", name: "Standard Shipping", description: "5-7 business days", minDays: 5, maxDays: 7 },
  { mailClass: "PRIORITY_MAIL", name: "Priority Mail", description: "1-3 business days", minDays: 1, maxDays: 3 },
  { mailClass: "PRIORITY_MAIL_EXPRESS", name: "Priority Mail Express", description: "Next business day", minDays: 1, maxDays: 1 },
];

function freeStandardRate() {
  return [{
    id: "usps-ground-free",
    name: "Standard Shipping",
    description: "5-7 business days",
    carrier: "USPS",
    mail_class: "USPS_GROUND_ADVANTAGE",
    price_cents: 0,
    min_delivery_days: 5,
    max_delivery_days: 7,
  }];
}

async function fetchUSPSRate(
  oauthToken: string,
  mailClass: string,
  originZip: string,
  destZip: string,
  weightOz: number,
  lengthIn: number,
  widthIn: number,
  heightIn: number,
  mailingDate: string,
): Promise<number | null> {
  const weightLb = weightOz / 16;
  try {
    const res = await fetch(`${USPS_BASE}/prices/v3/total-rates/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${oauthToken}` },
      body: JSON.stringify({
        originZIPCode: originZip.slice(0, 5),
        destinationZIPCode: destZip.slice(0, 5),
        weight: weightLb,
        length: Number(lengthIn),
        width: Number(widthIn),
        height: Number(heightIn),
        mailClass,
        processingCategory: "MACHINABLE",
        destinationEntryFacilityType: "NONE",
        rateIndicator: "SP",
        priceType: "RETAIL",
        mailingDate,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data.totalBasePrice ?? data.rates?.[0]?.totalBasePrice;
    if (price == null) return null;
    return Math.round(Number(price) * 100);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const body = await request.json();
    const { subtotal_cents, zip, cart_id } = body;

    if (!subtotal_cents) {
      return NextResponse.json({ error: "subtotal_cents is required" }, { status: 400 });
    }

    // ── Check if all research cart items have weights ─────────────
    if (cart_id) {
      const { data: cartItems } = await supabase
        .from("research_cart_items")
        .select("quantity, research_product_variants ( weight_grams )")
        .eq("cart_id", cart_id);

      const missingWeight = (cartItems ?? []).some(
        (item: any) => !item.research_product_variants?.weight_grams
      );

      if (missingWeight) {
        return NextResponse.json({
          shipping_rates: freeStandardRate(),
          source: "free-fallback",
          reason: "missing-weight",
        });
      }
    }

    if (isLiveMode() && zip) {
      const { data: origin } = await supabase
        .from("shipping_origin")
        .select("postal_code")
        .eq("is_active", true)
        .single();

      const originZip = origin?.postal_code || process.env.USPS_FROM_ZIP || "";

      if (!originZip) {
        return fallbackToDbRates(supabase, subtotal_cents);
      }

      const { data: preset } = await supabase
        .from("package_presets")
        .select("weight_oz, length_in, width_in, height_in, name")
        .eq("is_default", true)
        .eq("is_active", true)
        .single();

      const weightOz = preset?.weight_oz ?? 2;
      const lengthIn = preset?.length_in ?? 10;
      const widthIn = preset?.width_in ?? 13;
      const heightIn = preset?.height_in ?? 1;
      const mailingDate = new Date().toISOString().split("T")[0];

      let oauthToken: string;
      try {
        oauthToken = await getOAuthToken();
      } catch {
        return fallbackToDbRates(supabase, subtotal_cents);
      }

      const results = await Promise.all(
        MAIL_CLASSES.map(async (mc) => {
          const priceCents = await fetchUSPSRate(
            oauthToken, mc.mailClass, originZip, zip,
            weightOz, lengthIn, widthIn, heightIn, mailingDate,
          );
          return { ...mc, price_cents: priceCents };
        })
      );

      const rates = results
        .filter((r) => r.price_cents !== null)
        .map((r) => ({
          id: `usps-${r.mailClass.toLowerCase().replace(/_/g, "-")}`,
          name: r.name,
          description: r.description,
          carrier: "USPS",
          mail_class: r.mailClass,
          price_cents: r.price_cents!,
          min_delivery_days: r.minDays,
          max_delivery_days: r.maxDays,
        }));

      if (subtotal_cents >= FREE_THRESHOLD_CENTS) {
        const ground = rates.find((r) => r.mail_class === "USPS_GROUND_ADVANTAGE");
        if (ground) {
          ground.price_cents = 0;
          ground.name = "Standard Shipping (Free!)";
        }
      }

      if (rates.length > 0) {
        return NextResponse.json({ shipping_rates: rates, source: "usps" });
      }
    }

    return fallbackToDbRates(supabase, subtotal_cents);
  } catch (error: any) {
    console.error("[Research Shipping Rates] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function fallbackToDbRates(supabase: any, subtotal_cents: number) {
  const { data: rates, error } = await supabase
    .from("shipping_rates")
    .select("*")
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load shipping rates" }, { status: 500 });
  }

  const filteredRates = (rates || [])
    .filter((rate: any) => {
      if (rate.min_subtotal_cents && subtotal_cents < rate.min_subtotal_cents) return false;
      if (rate.max_subtotal_cents && subtotal_cents > rate.max_subtotal_cents) return false;
      return true;
    })
    .map((rate: any) => ({
      id: rate.id,
      name: rate.name,
      description: rate.description || `${rate.min_delivery_days}-${rate.max_delivery_days} business days`,
      carrier: rate.carrier || "USPS",
      price_cents: rate.price_cents || rate.amount_cents || 0,
      min_delivery_days: rate.min_delivery_days || 5,
      max_delivery_days: rate.max_delivery_days || 7,
    }));

  return NextResponse.json({ shipping_rates: filteredRates, source: "db" });
}
