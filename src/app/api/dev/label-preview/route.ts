// app/api/dev/label-preview/route.ts
//
// DEV ONLY — generates a mock USPS-style shipping label PDF so you can
// inspect formatting without touching the USPS API or paying for postage.
//
// GET /api/dev/label-preview
// GET /api/dev/label-preview?method=Priority+Mail
// GET /api/dev/label-preview?weight_oz=14.5
//
// Remove this file (or gate it behind NODE_ENV check) before going to prod.

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// ─── Fake tracking number ────────────────────────────────────────────────────
const MOCK_TRACKING = '9400111899223397658538';
const MOCK_TRACKING_DISPLAY = '9400 1118 9922 3397 6585 38';

// ─── Barcode: simple Code-128-ish placeholder using thin/thick rect bars ─────
//    Real USPS uses Intelligent Mail Barcode (IMb). This is visual only.
function drawBarcode(
  page: import('pdf-lib').PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  digits: string,
) {
  // Pseudo-barcode: alternating thin/thick bars derived from tracking digits
  const bars: number[] = [];
  for (const ch of digits.replace(/\s/g, '')) {
    const n = parseInt(ch, 10);
    bars.push(n % 2 === 0 ? 1 : 2, n > 5 ? 3 : 1, 1, 2);
  }
  const totalUnits = bars.reduce((a, b) => a + b, 0);
  const unitW = width / totalUnits;
  let cx = x;
  let isBar = true;
  for (const units of bars) {
    const w = unitW * units;
    if (isBar) {
      page.drawRectangle({ x: cx, y, width: w - 0.4, height, color: rgb(0, 0, 0) });
    }
    cx += w;
    isBar = !isBar;
  }
}

export async function GET(req: NextRequest) {
  // Dev route — no auth guard needed (label data is all fake)

  const params = req.nextUrl.searchParams;
  const shippingMethod = params.get('method') ?? 'Priority Mail';
  const weightOz       = parseFloat(params.get('weight_oz') ?? '12.3');

  // ─── From address (from env) ──────────────────────────────────
  const fromName    = [process.env.USPS_FROM_FIRST_NAME, process.env.USPS_FROM_LAST_NAME].filter(Boolean).join(' ')
                      || 'Kaitlyn Byrd';
  const fromCompany = process.env.USPS_FROM_COMPANY ?? 'Desert Cowgirl Co.';
  const fromStreet  = process.env.USPS_FROM_STREET  ?? '232 SAHARA DR';
  const fromCity    = process.env.USPS_FROM_CITY    ?? 'Ridgecrest';
  const fromState   = process.env.USPS_FROM_STATE   ?? 'CA';
  const fromZip     = process.env.USPS_FROM_ZIP     ?? '93555';

  // ─── Mock "to" address ────────────────────────────────────────
  const toName    = 'Jane Sample Customer';
  const toStreet  = '4721 MOCKINGBIRD LN APT 3B';
  const toCity    = 'Austin';
  const toState   = 'TX';
  const toZip     = '78701-2345';

  // ─── Mock order info ──────────────────────────────────────────
  const orderNumber = 'DCG-TEST-001';
  const weightLb    = Math.floor(weightOz / 16);
  const remOz       = Math.round((weightOz % 16) * 100) / 100;
  const weightStr   = weightLb > 0 ? `${weightLb} LB ${remOz} OZ` : `${remOz} OZ`;
  const postageStr  = '$9.35 (MOCK)';
  const labelDate   = new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  // ─── Build PDF (4" × 6" label = 288pt × 432pt) ───────────────
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([288, 432]);   // 4×6 inches at 72dpi
  const { width, height } = page.getSize();

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  const gray  = rgb(0.5, 0.5, 0.5);

  let y = height; // top-down cursor

  // ── Outer border ──────────────────────────────────────────────
  page.drawRectangle({ x: 4, y: 4, width: width - 8, height: height - 8,
    borderColor: black, borderWidth: 1.5, color: white });

  // ── "MOCK LABEL – NOT FOR POSTAGE" watermark banner ───────────
  page.drawRectangle({ x: 4, y: height - 22, width: width - 8, height: 18,
    color: rgb(1, 0.9, 0) });
  page.drawText('*** MOCK LABEL - NOT FOR POSTAGE ***', {
    x: 12, y: height - 17, size: 7, font: bold, color: rgb(0.6, 0.3, 0),
  });
  y = height - 26;

  // ── FROM block ────────────────────────────────────────────────
  const fromY = y;
  page.drawText('FROM:', { x: 10, y: fromY - 10, size: 6, font: bold, color: gray });
  page.drawText(fromCompany, { x: 10, y: fromY - 20, size: 7.5, font: bold, color: black });
  page.drawText(fromName,    { x: 10, y: fromY - 30, size: 7, font: regular, color: black });
  page.drawText(fromStreet,  { x: 10, y: fromY - 39, size: 7, font: regular, color: black });
  page.drawText(`${fromCity}, ${fromState} ${fromZip}`,
                             { x: 10, y: fromY - 48, size: 7, font: regular, color: black });

  // ── USPS logo placeholder (just text) ────────────────────────
  const logoX = width - 75;
  page.drawRectangle({ x: logoX, y: fromY - 55, width: 65, height: 48,
    color: rgb(0.18, 0.31, 0.57) });
  page.drawText('USPS', { x: logoX + 6, y: fromY - 25, size: 18, font: bold, color: white });
  page.drawText('MOCK', { x: logoX + 6, y: fromY - 42, size: 9, font: bold, color: rgb(1,0.9,0) });

  y = fromY - 60;

  // ── Horizontal rule ───────────────────────────────────────────
  page.drawLine({ start: { x: 4, y }, end: { x: width - 4, y }, thickness: 1, color: black });
  y -= 4;

  // ── Service name bar ─────────────────────────────────────────
  page.drawRectangle({ x: 4, y: y - 20, width: width - 8, height: 20, color: black });
  page.drawText(shippingMethod.toUpperCase(), {
    x: 10, y: y - 14, size: 9, font: bold, color: white,
  });
  page.drawText('UNITED STATES POSTAL SERVICE', {
    x: width - 175, y: y - 14, size: 7, font: regular, color: rgb(0.7, 0.7, 0.7),
  });
  y -= 26;

  // ── TO block ─────────────────────────────────────────────────
  page.drawText('TO:', { x: 10, y: y - 8, size: 6, font: bold, color: gray });
  page.drawText(toName,   { x: 10, y: y - 24, size: 12, font: bold, color: black });
  page.drawText(toStreet, { x: 10, y: y - 38, size: 10, font: regular, color: black });
  page.drawText(`${toCity}, ${toState} ${toZip}`, {
    x: 10, y: y - 51, size: 10, font: regular, color: black,
  });
  y -= 64;

  // ── Horizontal rule ───────────────────────────────────────────
  page.drawLine({ start: { x: 4, y }, end: { x: width - 4, y }, thickness: 0.5, color: black });
  y -= 6;

  // ── Order / postage / weight row ──────────────────────────────
  const metaY = y;
  page.drawText('ORDER',   { x: 10, y: metaY - 8, size: 6, font: bold, color: gray });
  page.drawText(orderNumber, { x: 10, y: metaY - 18, size: 8, font: bold, color: black });

  page.drawText('WEIGHT',  { x: 100, y: metaY - 8, size: 6, font: bold, color: gray });
  page.drawText(weightStr, { x: 100, y: metaY - 18, size: 8, font: bold, color: black });

  page.drawText('POSTAGE', { x: 185, y: metaY - 8, size: 6, font: bold, color: gray });
  page.drawText(postageStr,{ x: 185, y: metaY - 18, size: 8, font: regular, color: black });

  y = metaY - 30;

  // ── Tracking number text ──────────────────────────────────────
  page.drawText('TRACKING #', { x: 10, y, size: 6, font: bold, color: gray });
  y -= 12;
  page.drawText(MOCK_TRACKING_DISPLAY, {
    x: 10, y, size: 9, font: bold, color: black,
  });
  y -= 6;

  // ── Barcode ───────────────────────────────────────────────────
  drawBarcode(page, 10, y - 36, width - 20, 36, MOCK_TRACKING);
  y -= 44;

  // ── Horizontal rule ───────────────────────────────────────────
  page.drawLine({ start: { x: 4, y }, end: { x: width - 4, y }, thickness: 0.5, color: black });
  y -= 6;

  // ── Date + MID/CRID (from env) ────────────────────────────────
  const mid  = process.env.USPS_MID  ? `MID: ${process.env.USPS_MID}`  : '';
  const crid = process.env.USPS_CRID ? `CRID: ${process.env.USPS_CRID}` : '';
  page.drawText(`Date: ${labelDate}    ${mid}    ${crid}`, {
    x: 10, y: y - 8, size: 6, font: regular, color: gray,
  });
  y -= 18;

  // ── Delivery Instructions (placeholder box) ───────────────────
  page.drawRectangle({ x: 10, y: y - 30, width: width - 20, height: 28,
    borderColor: gray, borderWidth: 0.5, color: rgb(0.97, 0.97, 0.97) });
  page.drawText('DELIVERY INSTRUCTIONS: Leave if no response / Do not leave if no response',
    { x: 14, y: y - 14, size: 5.5, font: regular, color: gray });
  page.drawText('(Edit in real label - USPS API returns these from your shipment request)',
    { x: 14, y: y - 24, size: 5, font: regular, color: rgb(0.7, 0.5, 0) });
  y -= 38;

  // ── Footer ────────────────────────────────────────────────────
  page.drawText('This label is for layout preview only. No postage was purchased.',
    { x: 10, y: 10, size: 5.5, font: regular, color: rgb(0.6, 0.3, 0) });

  // ─── Serialize ───────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save();

  return new NextResponse(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="mock-label.pdf"',
      'X-Mock': 'true',
      'X-Tracking-Number': MOCK_TRACKING,
    },
  });
}