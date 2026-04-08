// lib/usps/mockLabel.ts
// Generates a realistic 4×6 USPS-style shipping label PDF
// using real order data — no USPS API call, no charge.
// Used when USPS_ENV=mock or credentials are missing.
//
// Install: npm install pdf-lib

import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

interface MockLabelInput {
  orderNumber: number | string;
  toName: string;
  toAddress1: string;
  toAddress2?: string;
  toCity: string;
  toState: string;
  toZip: string;
  fromName: string;
  fromCompany: string;
  fromAddress1: string;
  fromCity: string;
  fromState: string;
  fromZip: string;
  mailClass: string;
  weightLb: number;
  weightOz?: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  mailingDate: string;
}

// Fake tracking number that looks real — won't actually scan
function fakeTacking(): string {
  const base = '9400111899' + String(Date.now()).slice(-10);
  return base.padEnd(22, '0').slice(0, 22);
}

// Draw a simple barcode-like visual (stripes) — purely decorative
function drawBarcode(
  page: any,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const barWidths = [2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1,
                     1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 2, 1, 1, 3, 1, 2, 1, 3, 1, 2];
  let xPos = x;
  let isBar = true;
  for (const w of barWidths) {
    const barW = (w / 80) * width;
    if (isBar) {
      page.drawRectangle({
        x: xPos,
        y,
        width: barW,
        height,
        color: rgb(0, 0, 0),
      });
    }
    xPos += barW;
    isBar = !isBar;
    if (xPos >= x + width) break;
  }
}

export async function generateMockLabel(input: MockLabelInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  // 4×6 inches in points (1 inch = 72 pts)
  const W = 4 * 72;  // 288
  const H = 6 * 72;  // 432

  const page = doc.addPage([W, H]);

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  const gray  = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.88, 0.88, 0.88);

  // ── White background ──────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: white });

  // ── Outer border ──────────────────────────────────────────────
  page.drawRectangle({
    x: 4, y: 4, width: W - 8, height: H - 8,
    borderColor: black, borderWidth: 1.5,
    color: white,
  });

  let y = H - 12; // cursor from top

  // ── TOP BAND: "USPS SAMPLE LABEL" ─────────────────────────────
  page.drawRectangle({ x: 4, y: y - 20, width: W - 8, height: 22, color: black });
  page.drawText('USPS PRIORITY MAIL®', {
    x: 10, y: y - 14,
    size: 9, font: bold, color: white,
  });
  page.drawText('SAMPLE — NOT FOR MAILING', {
    x: W - 10 - bold.widthOfTextAtSize('SAMPLE — NOT FOR MAILING', 7),
    y: y - 13,
    size: 7, font: bold, color: rgb(1, 0.9, 0),
  });
  y -= 24;

  // ── MAIL CLASS strip ──────────────────────────────────────────
  page.drawRectangle({ x: 4, y: y - 16, width: W - 8, height: 18, color: lightGray });
  const mailClassText = (input.mailClass || 'PRIORITY MAIL').toUpperCase();
  page.drawText(mailClassText, {
    x: 10, y: y - 10,
    size: 10, font: bold, color: black,
  });
  page.drawText(input.mailingDate, {
    x: W - 10 - normal.widthOfTextAtSize(input.mailingDate, 8),
    y: y - 10,
    size: 8, font: normal, color: gray,
  });
  y -= 20;

  // ── DIVIDER ───────────────────────────────────────────────────
  page.drawLine({ start: { x: 4, y }, end: { x: W - 4, y }, thickness: 0.5, color: gray });
  y -= 8;

  // ── FROM address (small, top-left) ───────────────────────────
  page.drawText('FROM:', { x: 10, y, size: 6, font: bold, color: gray });
  y -= 9;
  page.drawText(input.fromCompany || input.fromName, {
    x: 10, y, size: 7.5, font: bold, color: black,
  });
  y -= 9;
  page.drawText(input.fromAddress1, { x: 10, y, size: 7, font: normal, color: black });
  y -= 9;
  page.drawText(`${input.fromCity}, ${input.fromState} ${input.fromZip}`, {
    x: 10, y, size: 7, font: normal, color: black,
  });
  y -= 14;

  // ── DIVIDER ───────────────────────────────────────────────────
  page.drawLine({ start: { x: 4, y }, end: { x: W - 4, y }, thickness: 0.5, color: gray });
  y -= 12;

  // ── TO address (large) ───────────────────────────────────────
  page.drawText('SHIP TO:', { x: 10, y, size: 7, font: bold, color: gray });
  y -= 13;

  page.drawText(input.toName, { x: 10, y, size: 14, font: bold, color: black });
  y -= 16;

  page.drawText(input.toAddress1, { x: 10, y, size: 11, font: normal, color: black });
  y -= 13;

  if (input.toAddress2) {
    page.drawText(input.toAddress2, { x: 10, y, size: 11, font: normal, color: black });
    y -= 13;
  }

  page.drawText(`${input.toCity}, ${input.toState}  ${input.toZip}`, {
    x: 10, y, size: 13, font: bold, color: black,
  });
  y -= 18;

  // ── DIVIDER ───────────────────────────────────────────────────
  page.drawLine({ start: { x: 4, y }, end: { x: W - 4, y }, thickness: 0.5, color: gray });
  y -= 8;

  // ── Package info row ─────────────────────────────────────────
  const weightStr = input.weightOz
    ? `${Math.floor(input.weightLb)} lb ${input.weightOz} oz`
    : `${input.weightLb} lb`;
  const dimsStr = `${input.lengthIn}" × ${input.widthIn}" × ${input.heightIn}"`;

  page.drawText(`Wt: ${weightStr}   Dims: ${dimsStr}   Order: #${input.orderNumber}`, {
    x: 10, y, size: 7, font: normal, color: gray,
  });
  y -= 14;

  // ── DIVIDER ───────────────────────────────────────────────────
  page.drawLine({ start: { x: 4, y }, end: { x: W - 4, y }, thickness: 0.5, color: gray });
  y -= 10;

  // ── Barcode (decorative) ─────────────────────────────────────
  const barcodeH = 42;
  const barcodeY = y - barcodeH;
  drawBarcode(page, 10, barcodeY, W - 20, barcodeH);
  y = barcodeY - 6;

  // ── Tracking number text ──────────────────────────────────────
  const tracking = fakeTacking();
  const trackingFormatted = tracking.replace(/(.{4})/g, '$1 ').trim();
  const trackW = bold.widthOfTextAtSize(trackingFormatted, 9);
  page.drawText(trackingFormatted, {
    x: (W - trackW) / 2, y,
    size: 9, font: bold, color: black,
  });
  y -= 14;

  // ── DIVIDER ───────────────────────────────────────────────────
  page.drawLine({ start: { x: 4, y }, end: { x: W - 4, y }, thickness: 0.5, color: gray });
  y -= 10;

  // ── ZIP code large (postal routing) ──────────────────────────
  const zipDisplay = input.toZip.slice(0, 5);
  const zipW = bold.widthOfTextAtSize(zipDisplay, 32);
  page.drawText(zipDisplay, {
    x: (W - zipW) / 2, y: y - 28,
    size: 32, font: bold, color: black,
  });

  // ── SAMPLE diagonal watermark ──────────────────────────────────
  // Drawn last so it sits on top of everything
  page.drawText('SAMPLE', {
    x: 30,
    y: 90,
    size: 72,
    font: bold,
    color: rgb(0.85, 0.85, 0.85),
    opacity: 0.45,
    rotate: degrees(35),
  });

  const pdfBytes = await doc.save();
  return pdfBytes;
}

// Fake tracking number for external use (returned in headers)
export function generateFakeTrackingNumber(): string {
  return '9400111899' + String(Date.now()).slice(-10).padEnd(12, '0').slice(0, 12);
}