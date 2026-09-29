// app/api/orders/[id]/validate-zelle/route.ts
//
// Admin endpoint to validate an offline Zelle payment by uploading a screenshot
// of the bank confirmation. Marks payment_status='paid' and status='processing',
// enabling the standard shipping label generation and fulfillment email pipeline.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    // 1) Fetch order to verify existence and existing notes
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, payment_status, internal_notes, customer_notes")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2) Parse FormData
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const note = formData.get("note") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Confirmation screenshot file is required" },
        { status: 400 }
      );
    }

    // 3) Upload screenshot to Supabase Storage
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = `zelle-confirmations/${orderId}/${Date.now()}-${cleanFileName}`;
    let proofUrl = "";

    try {
      const fileBytes = await file.arrayBuffer();
      const fileBuffer = Buffer.from(fileBytes);

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("research-images")
        .upload(storagePath, fileBuffer, {
          contentType: file.type || "image/png",
          upsert: true,
        });

      if (!uploadErr) {
        const { data: publicUrlData } = supabase.storage
          .from("research-images")
          .getPublicUrl(storagePath);
        proofUrl = publicUrlData?.publicUrl || "";
      } else {
        console.warn("[validate-zelle] Supabase storage upload warning:", uploadErr.message);
      }
    } catch (storageException: any) {
      console.warn("[validate-zelle] Storage exception:", storageException?.message);
    }

    // If storage upload failed to generate public URL, create a fallback indicator
    if (!proofUrl) {
      proofUrl = `storage:research-images/${storagePath}`;
    }

    // 4) Build updated notes
    const timestamp = new Date().toISOString();
    const verificationLog = `[Zelle Verified on ${timestamp} by ${user.email ?? "admin"}] Proof: ${proofUrl}${note ? ` | Note: ${note}` : ""}`;
    const newInternalNotes = [order.internal_notes, verificationLog].filter(Boolean).join("\n");
    const newCustomerNotes = [order.customer_notes, "Zelle payment confirmed & verified."].filter(Boolean).join(" | ");

    // 5) Update orders table
    const { data: updatedOrder, error: updateErr } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        status: "processing",
        payment_method: "zelle",
        payment_method_brand: "zelle",
        internal_notes: newInternalNotes,
        customer_notes: newCustomerNotes,
        updated_at: timestamp,
      })
      .eq("id", orderId)
      .select("id, order_number, payment_status, status, internal_notes")
      .single();

    if (updateErr) {
      console.error("[validate-zelle] Order update error:", updateErr.message);
      return NextResponse.json(
        { error: "Failed to update order payment status", details: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      proof_url: proofUrl,
      payment_status: "paid",
      status: "processing",
      order: updatedOrder,
    });
  } catch (err: any) {
    console.error("[validate-zelle] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message },
      { status: 500 }
    );
  }
}