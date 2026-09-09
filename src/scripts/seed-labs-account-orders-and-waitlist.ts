import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log("=== 1. Updating Tyler's Profiles ===");
  const targetEmails = ["admin@unenter.live", "skillet1005@gmail.com"];
  
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, role")
    .in("email", targetEmails);

  if (pErr) console.error("Error fetching profiles:", pErr);
  console.log("Found profiles:", profiles);

  for (const p of profiles || []) {
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        first_name: "Tyler",
        last_name: "Burns",
        display_name: "Tyler Burns",
        region: "US",
        research_terms_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    if (upErr) console.error(`Error updating profile ${p.email}:`, upErr.message);
    else console.log(`✓ Updated profile for ${p.email} (terms accepted, name set)`);
  }

  console.log("\n=== 2. Ensuring YK-11 exists in research_products ===");
  const ykSlug = "yk-11-liquid-10mg-ml-30ml";
  let { data: ykProduct } = await supabase
    .from("research_products")
    .select("id, title, slug")
    .eq("slug", ykSlug)
    .maybeSingle();

  if (!ykProduct) {
    const { data: newProd, error: prodErr } = await supabase
      .from("research_products")
      .insert({
        title: "YK-11 Liquid 10mg/ml, 30ml",
        slug: ykSlug,
        description: "High-purity YK-11 (Myostatin inhibitor) liquid solution for laboratory research and analytical characterization.",
        price_cents: 6999,
        dosage_label: "30ml",
        brand: "Unenter Labs",
        cas_number: "1370003-76-1",
        purity_percent: 99.2,
        status: "out_of_stock",
        research_use_only: true,
      })
      .select("id, title, slug")
      .single();

    if (prodErr) {
      console.error("Error creating YK-11 product:", prodErr.message);
    } else {
      ykProduct = newProd;
      console.log("✓ Created YK-11 in research_products:", ykProduct?.id);
    }
  } else {
    console.log("YK-11 already exists:", ykProduct.id);
  }

  console.log("\n=== 3. Adding YK-11 to Waitlist (research_stock_notifications) ===");
  if (ykProduct?.id) {
    for (const p of profiles || []) {
      const { data: existingWaitlist } = await supabase
        .from("research_stock_notifications")
        .select("id")
        .eq("research_product_id", ykProduct.id)
        .eq("user_id", p.id)
        .maybeSingle();

      if (!existingWaitlist) {
        const { error: wErr } = await supabase
          .from("research_stock_notifications")
          .insert({
            research_product_id: ykProduct.id,
            user_id: p.id,
            email: p.email,
          });

        if (wErr) console.error(`Error adding to waitlist for ${p.email}:`, wErr.message);
        else console.log(`✓ Added YK-11 to waitlist for ${p.email}`);
      } else {
        console.log(`YK-11 already on waitlist for ${p.email}`);
      }
    }
  }

  console.log("\n=== 4. Fetching Real Unenter Labs Products for Orders ===");
  const { data: bpcProduct } = await supabase
    .from("research_products")
    .select("id, title, slug, price_cents")
    .eq("slug", "bpc-157-tb-500-cartalax-blend-10mg-10mg-20mg")
    .single();

  const { data: glutProduct } = await supabase
    .from("research_products")
    .select("id, title, slug, price_cents")
    .eq("slug", "glutathione-1000mg")
    .single();

  console.log("BPC Product:", bpcProduct?.title, bpcProduct?.id);
  console.log("Glutathione Product:", glutProduct?.title, glutProduct?.id);

  console.log("\n=== 5. Seeding Orders for Admin & Tyler ===");
  const adminProfile = profiles?.find((p) => p.email === "admin@unenter.live") || profiles?.[0];
  const userProfile = profiles?.find((p) => p.email === "skillet1005@gmail.com");

  const targetProfiles = [adminProfile, userProfile].filter(Boolean);

  const addressData = {
    full_name: "Tyler Burns",
    line1: "1619 N Chaparral Dr",
    city: "Ridgecrest",
    state: "CA",
    postal_code: "93555",
    country: "US",
    phone: "+17602646947",
  };

  for (const prof of targetProfiles) {
    if (!prof) continue;

    // Order 1: #198040 (Cartalax / TB4 / BPC-157 - 40mg)
    const orderNum1 = `198040`;
    const { data: ex1 } = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", orderNum1)
      .eq("auth_user_id", prof.id)
      .maybeSingle();

    if (!ex1) {
      const { data: ord1, error: ord1Err } = await supabase
        .from("orders")
        .insert({
          order_number: orderNum1,
          auth_user_id: prof.id,
          user_id: prof.id,
          profile_id: prof.id,
          order_source: "research",
          source: "research",
          status: "fulfilled",
          payment_status: "paid",
          currency: "USD",
          subtotal_cents: 12900,
          discount_cents: 1935,
          shipping_cents: 1200,
          tax_cents: 0,
          total_cents: 12465,
          shipping_method_name: "UPS/FedEx 2-5 Business Days",
          shipping_address: addressData,
          billing_address: addressData,
          email: prof.email,
          customer_email: prof.email,
          customer_first_name: "Tyler",
          customer_last_name: "Burns",
          phone: "+17602646947",
          tracking_number: "382394758597",
          tracking_url: "https://www.fedex.com/fedextrack/?trknbr=382394758597",
          payment_method_brand: "visa",
          payment_method_last4: "4242",
          shipped_at: "2026-07-02T11:56:00Z",
          created_at: "2026-07-02T11:56:00Z",
          updated_at: "2026-07-02T11:56:00Z",
          customer_notes: "Carrier: fedex. Tracking number: 382394758597. Shipping Protection: $3.00",
        })
        .select("id")
        .single();

      if (ord1Err) {
        console.error(`Error creating order 198040 for ${prof.email}:`, ord1Err.message);
      } else {
        console.log(`✓ Created order 198040 (${ord1.id}) for ${prof.email}`);

        // Insert order_items
        const { error: it1Err } = await supabase.from("order_items").insert({
          order_id: ord1.id,
          research_product_id: bpcProduct?.id,
          product_title: "Cartalax / TB4 / BPC-157 - 40mg",
          title: "Cartalax / TB4 / BPC-157 - 40mg",
          variant_title: "10mg/10mg/20mg Blend",
          sku: "PEP-CTB-40MG",
          quantity: 1,
          price_cents: 12900,
          currency: "USD",
        });

        if (it1Err) console.error("Error inserting order item for 198040:", it1Err.message);
        else console.log("✓ Inserted Cartalax/TB4/BPC item for 198040");

        // Insert order_addresses
        await supabase.from("order_addresses").insert({
          order_id: ord1.id,
          full_name: addressData.full_name,
          line1: addressData.line1,
          city: addressData.city,
          region: addressData.state,
          postal_code: addressData.postal_code,
          country: addressData.country,
          phone: addressData.phone,
        });
      }
    } else {
      console.log(`Order 198040 already exists for ${prof.email}`);
    }

    // Order 2: #97884 (Glutathione 1000mg)
    const orderNum2 = `97884`;
    const { data: ex2 } = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", orderNum2)
      .eq("auth_user_id", prof.id)
      .maybeSingle();

    if (!ex2) {
      const { data: ord2, error: ord2Err } = await supabase
        .from("orders")
        .insert({
          order_number: orderNum2,
          auth_user_id: prof.id,
          user_id: prof.id,
          profile_id: prof.id,
          order_source: "research",
          source: "research",
          status: "fulfilled",
          payment_status: "paid",
          currency: "USD",
          subtotal_cents: 4830,
          discount_cents: 724,
          shipping_cents: 1495,
          tax_cents: 0,
          total_cents: 5801,
          shipping_method_name: "Priority Shipping (2-4 days)",
          shipping_address: addressData,
          billing_address: addressData,
          email: prof.email,
          customer_email: prof.email,
          customer_first_name: "Tyler",
          customer_last_name: "Burns",
          phone: "+17602646947",
          tracking_number: "382498989166",
          tracking_url: "https://www.fedex.com/apps/fedextrack/?action=track&action=track&tracknumbers=382498989166",
          payment_method_brand: "Zelle",
          shipped_at: "2026-07-08T10:15:00Z",
          created_at: "2026-07-07T14:30:00Z",
          updated_at: "2026-07-08T10:15:00Z",
          customer_notes: "Provider: Fedex. Tracking: 382498989166. Package Protection: $2.00. You saved $20.70",
        })
        .select("id")
        .single();

      if (ord2Err) {
        console.error(`Error creating order 97884 for ${prof.email}:`, ord2Err.message);
      } else {
        console.log(`✓ Created order 97884 (${ord2.id}) for ${prof.email}`);

        // Insert order_items
        const { error: it2Err } = await supabase.from("order_items").insert({
          order_id: ord2.id,
          research_product_id: glutProduct?.id,
          product_title: "Glutathione 1000mg",
          title: "Glutathione 1000mg",
          variant_title: "Lyophilized Powder",
          sku: "PEP-GLUT-1000",
          quantity: 1,
          price_cents: 4830,
          currency: "USD",
        });

        if (it2Err) console.error("Error inserting order item for 97884:", it2Err.message);
        else console.log("✓ Inserted Glutathione item for 97884");

        // Insert order_addresses
        await supabase.from("order_addresses").insert({
          order_id: ord2.id,
          full_name: addressData.full_name,
          line1: addressData.line1,
          city: addressData.city,
          region: addressData.state,
          postal_code: addressData.postal_code,
          country: addressData.country,
          phone: addressData.phone,
        });
      }
    } else {
      console.log(`Order 97884 already exists for ${prof.email}`);
    }
  }

  console.log("\n=== Seeding Finished Successfully ===");
}

main().catch(console.error);
