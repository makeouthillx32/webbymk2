// app/api/orders/[id]/label/route.ts
// Generates a USPS shipping label for an order.
//
// RESEARCH FULFILLMENT GATE:
//   Before label purchase / generation:
//   1. Payment must be confirmed (payment_status === 'paid').
//   2. Shipping address must be complete.
//   3. Every research order item must be allocated to a physical production batch.
//   4. Batch must be active/released and unexpired.
//   5. Batch must have an approved, published COA on file.
//   6. Label creation records label_created_at, staff audit, and packaging preset,
//      keeping "label created" strictly distinct from "shipped / handed to carrier".

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireAdminClient } from '@/lib/require-admin';
import { getOAuthToken, getPaymentToken } from '@/lib/usps/tokens';
import { resolveMailClass, resolveRateIndicator } from '@/lib/usps/mailClass';
import { generateMockLabel, generateFakeTrackingNumber } from '@/lib/usps/mockLabel';

const USPS_ENV = process.env.USPS_ENV ?? 'mock';
const USPS_BASE = USPS_ENV === 'production'
  ? 'https://apis.usps.com'
  : 'https://apis-tem.usps.com';

function isMockMode(): boolean {
  if (USPS_ENV === 'mock') return true;
  const hasCreds =
    process.env.USPS_CONSUMER_KEY &&
    process.env.USPS_CONSUMER_SECRET &&
    process.env.USPS_FROM_STREET &&
    process.env.USPS_FROM_CITY &&
    process.env.USPS_FROM_STATE &&
    process.env.USPS_FROM_ZIP;
  return !hasCreds;
}

interface PackageDimensions {
  weightLb: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  presetName?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient();
    const gate = await requireAdminClient(supabase);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }
    const admin = createAdminClient();

    const { id } = await params;

    const body = await request.json() as PackageDimensions;
    const { weightLb, lengthIn, widthIn, heightIn, presetName } = body;

    if (!weightLb || !lengthIn || !widthIn || !heightIn) {
      return NextResponse.json(
        { error: 'Missing required package dimensions: weightLb, lengthIn, widthIn, heightIn' },
        { status: 400 }
      );
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select(`
        id,
        order_number,
        payment_status,
        status,
        shipping_address,
        shipping_method_name,
        customer_first_name,
        customer_last_name,
        email,
        fulfillment_audit
      `)
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // ── RESEARCH GATE 1: Payment Verification ──────────────────────
    if (order.payment_status !== 'paid') {
      return NextResponse.json(
        {
          error: `Payment not confirmed (Current status: "${order.payment_status}"). Order must be paid before purchasing a USPS postage label.`,
          code: 'PAYMENT_REQUIRED',
        },
        { status: 422 }
      );
    }

    // ── RESEARCH GATE 2: Address Validation ────────────────────────
    const addr = order.shipping_address as {
      firstName?: string; lastName?: string;
      address1?: string; address2?: string;
      city?: string; state?: string; zip?: string;
      country?: string; phone?: string;
    } | null;

    if (!addr?.address1 || !addr?.city || !addr?.state || !addr?.zip) {
      return NextResponse.json(
        { error: 'Order is missing a complete shipping address (Street, City, State, ZIP required)', code: 'INVALID_ADDRESS' },
        { status: 400 }
      );
    }

    // ── RESEARCH GATE 3: Batch Allocation & COA Release Checks ─────
    const { data: orderItems, error: itemsErr } = await admin
      .from('order_items')
      .select(`
        id,
        title,
        product_title,
        quantity,
        research_product_id,
        allocated_batch_id,
        research_batches (
          id,
          batch_number,
          status,
          expiration_date,
          remaining_quantity
        )
      `)
      .eq('order_id', id);

    if (itemsErr) {
      return NextResponse.json({ error: `Failed to check order items: ${itemsErr.message}` }, { status: 500 });
    }

    const researchItems = (orderItems ?? []).filter((i) => !!i.research_product_id);
    for (const item of researchItems) {
      const b = item.research_batches as any;
      if (!item.allocated_batch_id || !b) {
        return NextResponse.json(
          {
            error: `Physical batch required: Research compound "${item.product_title || item.title}" has not been allocated to a production batch.`,
            code: 'BATCH_UNALLOCATED',
          },
          { status: 422 }
        );
      }

      if (b.status !== 'active') {
        return NextResponse.json(
          {
            error: `Batch ${b.batch_number} is in status "${b.status}". Only active, released batches can be fulfilled.`,
            code: 'BATCH_NOT_RELEASED',
          },
          { status: 422 }
        );
      }

      if (b.expiration_date && new Date(b.expiration_date) < new Date()) {
        return NextResponse.json(
          {
            error: `Batch ${b.batch_number} expired on ${b.expiration_date}. Cannot ship expired laboratory compound.`,
            code: 'BATCH_EXPIRED',
          },
          { status: 422 }
        );
      }

      // Verify Published COA exists for this batch
      const { count: coaCount } = await admin
        .from('research_lab_reports')
        .select('id', { count: 'exact', head: true })
        .or(`batch_id.eq.${b.id},lot_number.eq.${b.batch_number}`)
        .eq('published_status', 'published');

      if (!coaCount || coaCount === 0) {
        return NextResponse.json(
          {
            error: `Quality release blocked: Batch ${b.batch_number} does not have an approved, published COA on file.`,
            code: 'COA_NOT_PUBLISHED',
          },
          { status: 422 }
        );
      }
    }

    const mailClass = resolveMailClass(order.shipping_method_name);
    const mailingDate = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    // ── MOCK MODE ──────────────────────────────────────────────────
    if (isMockMode()) {
      console.log('[USPS Label] Mock mode — generating local PDF, no postage charge');

      const toName = [
        addr.firstName ?? order.customer_first_name ?? '',
        addr.lastName  ?? order.customer_last_name  ?? '',
      ].filter(Boolean).join(' ') || order.email;

      const pdfBytes = await generateMockLabel({
        orderNumber:  order.order_number,
        toName,
        toAddress1:   addr.address1,
        toAddress2:   addr.address2 ?? undefined,
        toCity:       addr.city,
        toState:      addr.state,
        toZip:        addr.zip.replace(/\D/g, '').slice(0, 5),
        fromName:     process.env.USPS_FROM_FIRST_NAME ?? 'Dr. Vance',
        fromCompany:  process.env.USPS_FROM_COMPANY ?? 'Unenter Labs',
        fromAddress1: process.env.USPS_FROM_STREET ?? '123 Analytical Way',
        fromCity:     process.env.USPS_FROM_CITY   ?? 'Austin',
        fromState:    process.env.USPS_FROM_STATE  ?? 'TX',
        fromZip:      process.env.USPS_FROM_ZIP    ?? '78701',
        mailClass,
        weightLb,
        lengthIn,
        widthIn,
        heightIn,
        mailingDate,
      });

      const fakeTracking = generateFakeTrackingNumber();
      const fakeTrackingUrl = `https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=${fakeTracking}`;

      // Record label creation without prematurely marking order as fulfilled!
      const auditEntry = {
        timestamp: nowIso,
        action: 'label_purchased_mock',
        tracking_number: fakeTracking,
        postage_cents: 0,
        package_preset: presetName ?? 'Custom',
        weight_oz: weightLb * 16,
      };

      await admin
        .from('orders')
        .update({
          tracking_number: fakeTracking,
          tracking_url: fakeTrackingUrl,
          label_created_at: nowIso,
          package_preset: presetName ?? null,
          package_weight_oz: weightLb * 16,
          fulfillment_audit: [...((order as any).fulfillment_audit || []), auditEntry],
        })
        .eq('id', id);

      return new NextResponse(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="label-${order.order_number}-SAMPLE.pdf"`,
          'X-Tracking-Number': fakeTracking,
          'X-Tracking-URL':    fakeTrackingUrl,
          'X-Postage':         '0',
          'X-Label-Cached':    'false',
          'X-Mock-Mode':       'true',
        },
      });
    }

    // ── LIVE MODE ──────────────────────────────────────────────────
    const rateIndicator = resolveRateIndicator(mailClass);
    const oauthToken   = await getOAuthToken();
    const paymentToken = await getPaymentToken(oauthToken);

    const labelPayload = {
      imageInfo: {
        imageType: 'PDF',
        labelType: '4X6LABEL',
        receiptOption: 'NONE',
        suppressPostage: false,
        suppressMailDate: false,
        returnLabel: false,
      },
      toAddress: {
        firstName:        addr.firstName ?? order.customer_first_name ?? '',
        lastName:         addr.lastName  ?? order.customer_last_name  ?? '',
        streetAddress:    addr.address1,
        secondaryAddress: addr.address2 ?? undefined,
        city:    addr.city,
        state:   addr.state,
        ZIPCode: addr.zip.replace(/\D/g, '').slice(0, 5),
      },
      fromAddress: {
        firstName:     process.env.USPS_FROM_FIRST_NAME ?? '',
        lastName:      process.env.USPS_FROM_LAST_NAME  ?? '',
        firm:          process.env.USPS_FROM_COMPANY ?? 'Unenter Labs',
        streetAddress: process.env.USPS_FROM_STREET ?? '',
        city:          process.env.USPS_FROM_CITY   ?? '',
        state:         process.env.USPS_FROM_STATE  ?? '',
        ZIPCode:       process.env.USPS_FROM_ZIP    ?? '',
      },
      packageDescription: {
        mailClass,
        rateIndicator,
        weightUOM: 'lb',
        weight: weightLb,
        dimensionsUOM: 'in',
        length: lengthIn,
        width:  widthIn,
        height: heightIn,
        processingCategory: 'MACHINABLE',
        mailingDate,
        destinationEntryFacilityType: 'NONE',
      },
    };

    const uspsRes = await fetch(`${USPS_BASE}/labels/v3/label`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oauthToken}`,
        'X-Payment-Authorization-Token': paymentToken,
      },
      body: JSON.stringify(labelPayload),
    });

    if (!uspsRes.ok) {
      const errText = await uspsRes.text();
      console.error('[USPS Label] API error:', uspsRes.status, errText);
      return NextResponse.json(
        { error: `USPS API error ${uspsRes.status}`, details: errText },
        { status: 502 }
      );
    }

    const contentType = uspsRes.headers.get('content-type') ?? '';
    const boundary = contentType.match(/boundary=([^\s;]+)/)?.[1];

    if (!boundary) {
      return NextResponse.json(
        { error: 'Unexpected USPS response format — no multipart boundary' },
        { status: 502 }
      );
    }

    const rawBuffer = await uspsRes.arrayBuffer();
    const { metadata, pdfBuffer } = parseMultipart(rawBuffer, boundary);

    if (!pdfBuffer) {
      return NextResponse.json(
        { error: 'USPS did not return a PDF label' },
        { status: 502 }
      );
    }

    const trackingNumber: string = metadata?.trackingNumber ?? '';
    const postage: number = metadata?.postage ?? 0;
    const trackingUrl: string =
      metadata?.links?.find((l: any) => l.rel?.includes('Tracking URL'))?.href
      ?? `https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=${trackingNumber}`;

    // Upload PDF to Supabase storage
    const storagePath = `labels/${order.order_number}-${trackingNumber}.pdf`;
    await admin.storage
      .from('shipping-labels')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    const auditEntry = {
      timestamp: nowIso,
      action: 'label_purchased_live',
      tracking_number: trackingNumber,
      postage_cents: Math.round(postage * 100),
      package_preset: presetName ?? 'Custom',
      weight_oz: weightLb * 16,
    };

    if (trackingNumber) {
      await admin
        .from('orders')
        .update({
          tracking_number: trackingNumber,
          tracking_url: trackingUrl,
          label_created_at: nowIso,
          label_pdf_path: storagePath,
          label_postage_cents: Math.round(postage * 100),
          package_preset: presetName ?? null,
          package_weight_oz: weightLb * 16,
          fulfillment_audit: [...((order as any).fulfillment_audit || []), auditEntry],
        })
        .eq('id', id);
    }

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="label-${order.order_number}.pdf"`,
        'X-Tracking-Number': trackingNumber,
        'X-Postage':         String(postage),
        'X-Tracking-URL':    trackingUrl,
        'X-Label-Cached':    'false',
        'X-Mock-Mode':       'false',
      },
    });

  } catch (err: any) {
    console.error('[USPS Label] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}

// ── GET: reprint stored label from Supabase storage ───────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerClient();
    const gate = await requireAdminClient(supabase);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
    const admin = createAdminClient();

    const { id } = await params;

    const { data: order } = await admin
      .from('orders')
      .select('order_number, label_pdf_path, tracking_number, tracking_url, label_postage_cents')
      .eq('id', id)
      .single();

    if (!order?.label_pdf_path) {
      return NextResponse.json({ error: 'No stored label for this order' }, { status: 404 });
    }

    const { data: fileData, error: storageError } = await admin.storage
      .from('shipping-labels')
      .download(order.label_pdf_path);

    if (storageError || !fileData) {
      return NextResponse.json(
        { error: 'Failed to fetch label from storage', details: storageError?.message },
        { status: 500 }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="label-${order.order_number}.pdf"`,
        'X-Tracking-Number': order.tracking_number ?? '',
        'X-Tracking-URL':    order.tracking_url ?? '',
        'X-Postage':         String((order.label_postage_cents ?? 0) / 100),
        'X-Label-Cached':    'true',
        'X-Mock-Mode':       'false',
      },
    });

  } catch (err: any) {
    console.error('[USPS Label GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Multipart parser (live USPS response only) ────────────────────
function parseMultipart(
  buffer: ArrayBuffer,
  boundary: string
): { metadata: any; pdfBuffer: ArrayBuffer | null } {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  const boundaryBytes = new TextEncoder().encode(`--${boundary}`);

  const parts: Uint8Array[] = [];
  let start = 0;

  for (let i = 0; i < bytes.length - boundaryBytes.length; i++) {
    let match = true;
    for (let j = 0; j < boundaryBytes.length; j++) {
      if (bytes[i + j] !== boundaryBytes[j]) { match = false; break; }
    }
    if (match) {
      if (start > 0) parts.push(bytes.slice(start, i));
      start = i + boundaryBytes.length;
    }
  }

  let metadata: any = null;
  let pdfBuffer: ArrayBuffer | null = null;

  for (const part of parts) {
    const partText = decoder.decode(part.slice(0, 512));

    let headerEnd = -1;
    for (let i = 0; i < part.length - 3; i++) {
      if (part[i] === 13 && part[i+1] === 10 && part[i+2] === 13 && part[i+3] === 10) {
        headerEnd = i + 4;
        break;
      }
    }
    if (headerEnd === -1) continue;

    const headers = partText.slice(0, headerEnd);
    const body = part.slice(headerEnd);

    if (headers.includes('application/json') || headers.includes('labelMetadata')) {
      try {
        metadata = JSON.parse(decoder.decode(body).trim());
      } catch { /* ignore */ }
    } else if (headers.includes('application/pdf') || headers.includes('labelImage')) {
      const trimmed = body[body.length - 2] === 13 && body[body.length - 1] === 10
        ? body.slice(0, -2)
        : body;
      pdfBuffer = trimmed.buffer.slice(trimmed.byteOffset, trimmed.byteOffset + trimmed.byteLength);
    }
  }

  return { metadata, pdfBuffer };
}
