// src/zones/labs/account/api.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unenter Labs · research account API implementation.
//
// Routed ONLY in the labs image via the zone overlay wrapper at
//   zones/labs/src/app/api/research-account/route.ts
// so nothing here is reachable from shop / blog / tank / core.
//
// GET   → profile + orders + waitlist + cart
// PATCH → update editable identity fields or accept research terms
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const EDITABLE_FIELDS = ["display_name", "first_name", "last_name", "region"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

const PROFILE_COLUMNS =
  "id, display_name, first_name, last_name, avatar_url, email, region, role, " +
  "clearance_level, research_terms_accepted_at, terms_accepted_at, created_at, last_seen_at";

const MAX_FIELD_LEN = 120;

function sanitize(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_FIELD_LEN);
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }

    // Isolate Labs: strip any Tank avatar from the returned profile object
    if (profile.avatar_url && profile.avatar_url.includes("tank")) {
      profile.avatar_url = null;
    }

    // Research orders only
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select(
        `id, order_number, status, payment_status, total_cents, subtotal_cents,
         discount_cents, shipping_cents, tax_cents, currency, created_at, shipped_at, delivered_at,
         tracking_number, tracking_url, shipping_method_name, customer_notes,
         payment_method_brand, payment_method_last4, shipping_address, billing_address,
         order_items ( id, product_title, variant_title, sku, quantity, price_cents, currency )`
      )
      .eq("order_source", "research")
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id},profile_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (ordersErr) {
      console.error("[labs/account] orders fetch failed:", ordersErr.message);
    }

    // Waitlist / stock notification signups for this user
    const { data: waitlist, error: waitlistErr } = await supabase
      .from("research_stock_notifications")
      .select(
        `id, created_at, notified_at,
         research_product:research_products ( id, title, slug, price_cents, dosage_label, brand, cas_number, purity_percent, status )`
      )
      .or(`user_id.eq.${user.id},email.eq.${user.email ?? ""}`)
      .order("created_at", { ascending: false });

    if (waitlistErr) {
      console.error("[labs/account] waitlist fetch failed:", waitlistErr.message);
    }

    // Active research cart
    const { data: cart } = await supabase
      .from("research_carts")
      .select(
        `id, status, created_at, updated_at,
         research_cart_items ( id, quantity, research_product_id, research_variant_id )`
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    // User address book
    const { data: addressBook, error: addressErr } = await supabase
      .from("user_address_book")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default_shipping", { ascending: false })
      .order("created_at", { ascending: true });

    if (addressErr) {
      console.error("[labs/account] address book fetch failed:", addressErr.message);
    }

    return NextResponse.json({
      profile,
      orders: orders ?? [],
      waitlist: waitlist ?? [],
      cart: cart ?? null,
      address_book: addressBook ?? [],
      canOrder: profile.role === "researcher" || profile.role === "admin",
    });
  } catch (err) {
    console.error("[labs/account] GET failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────────────
// Adds a new entry to the user's address book

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const nickname = sanitize(body.nickname) || "Facility";
    const fullName = sanitize(body.full_name);
    const line1 = sanitize(body.line1);
    const city = sanitize(body.city);
    const state = sanitize(body.state);
    const postalCode = sanitize(body.postal_code);
    const country = sanitize(body.country) || "US";

    // full_name used to silently default to a hardcoded placeholder name
    // ("Tyler Burns") when omitted — for a real shipping address that means
    // a real package could ship labeled with a stranger's name instead of
    // failing loudly. Require it like the other address fields instead.
    if (!fullName || !line1 || !city || !state || !postalCode) {
      return NextResponse.json({ error: "missing_required_address_fields" }, { status: 400 });
    }

    const isDefaultShipping = Boolean(body.is_default_shipping);
    const isDefaultBilling = Boolean(body.is_default_billing);

    if (isDefaultShipping) {
      await supabase
        .from("user_address_book")
        .update({ is_default_shipping: false })
        .eq("user_id", user.id);
    }
    if (isDefaultBilling) {
      await supabase
        .from("user_address_book")
        .update({ is_default_billing: false })
        .eq("user_id", user.id);
    }

    const { data: inserted, error } = await supabase
      .from("user_address_book")
      .insert({
        user_id: user.id,
        nickname,
        full_name: fullName,
        company: sanitize(body.company),
        line1,
        line2: sanitize(body.line2),
        city,
        state,
        postal_code: postalCode,
        country,
        phone: sanitize(body.phone),
        is_default_shipping: isDefaultShipping,
        is_default_billing: isDefaultBilling,
      })
      .select()
      .single();

    if (error) {
      console.error("[labs/account] POST address error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, address: inserted });
  } catch (err) {
    console.error("[labs/account] POST failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

// ── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    // Address Book Specific Actions
    if (body.address_id && typeof body.address_id === "string") {
      const addressId = body.address_id;

      if (body.set_default_shipping === true) {
        await supabase.from("user_address_book").update({ is_default_shipping: false }).eq("user_id", user.id);
        await supabase.from("user_address_book").update({ is_default_shipping: true }).eq("id", addressId).eq("user_id", user.id);
        return NextResponse.json({ ok: true });
      }

      if (body.set_default_billing === true) {
        await supabase.from("user_address_book").update({ is_default_billing: false }).eq("user_id", user.id);
        await supabase.from("user_address_book").update({ is_default_billing: true }).eq("id", addressId).eq("user_id", user.id);
        return NextResponse.json({ ok: true });
      }

      // Updating an existing address
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("nickname" in body) updates.nickname = sanitize(body.nickname);
      if ("full_name" in body) updates.full_name = sanitize(body.full_name);
      if ("company" in body) updates.company = sanitize(body.company);
      if ("line1" in body) updates.line1 = sanitize(body.line1);
      if ("line2" in body) updates.line2 = sanitize(body.line2);
      if ("city" in body) updates.city = sanitize(body.city);
      if ("state" in body) updates.state = sanitize(body.state);
      if ("postal_code" in body) updates.postal_code = sanitize(body.postal_code);
      if ("country" in body) updates.country = sanitize(body.country);
      if ("phone" in body) updates.phone = sanitize(body.phone);

      const { data: updated, error } = await supabase
        .from("user_address_book")
        .update(updates)
        .eq("id", addressId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("[labs/account] PATCH address error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, address: updated });
    }

    // If user explicitly requests accepting terms
    if (body.accept_terms === true) {
      const now = new Date().toISOString();
      await supabase
        .from("profiles")
        .update({ research_terms_accepted_at: now, updated_at: now })
        .eq("id", user.id);
    }

    // Allow-list projection for profile
    const updates: Partial<Record<EditableField, string | null>> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) updates[field] = sanitize(body[field]);
    }

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from("profiles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .select(PROFILE_COLUMNS)
        .single();

      if (error) {
        console.error("[labs/account] PATCH failed:", error.message);
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
      }

      if (data.avatar_url && data.avatar_url.includes("tank")) {
        data.avatar_url = null;
      }

      return NextResponse.json({ profile: data, ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[labs/account] PATCH failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────
// Deletes an address book entry

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_address_book")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[labs/account] DELETE address error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[labs/account] DELETE failed:", err);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}

