// lib/thermalPrinter.ts
// Handles connection + printing to thermal printers via:
//   - Web Serial API  (USB cable — Chrome/Edge desktop)
//   - Web Bluetooth   (Bluetooth — Chrome desktop, NOT iOS Safari)
//
// iOS note: Neither Web Serial nor Web Bluetooth are available on Safari iOS.
// For iOS printing use window.print() with the @media print stylesheet instead.

import { EscPos, fmtMoney, fmtDate } from "./escpos";
import type { POSCartItem } from "@/components/POS/types";

// ── Type declarations (not in lib.dom.d.ts yet) ─────────────────────────────
declare global {
  interface Navigator {
    serial?: {
      requestPort(opts?: any): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
    bluetooth?: {
      requestDevice(opts: any): Promise<BluetoothDevice>;
    };
  }
  interface SerialPort {
    open(opts: any): Promise<void>;
    close(): Promise<void>;
    writable: WritableStream<Uint8Array>;
    readable: ReadableStream<Uint8Array>;
  }
  interface BluetoothDevice {
    gatt?: BluetoothRemoteGATTServer;
    name?: string;
  }
  interface BluetoothRemoteGATTServer {
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    connected: boolean;
    getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
  }
  interface BluetoothRemoteGATTService {
    getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
  }
  interface BluetoothRemoteGATTCharacteristic {
    writeValueWithoutResponse(data: BufferSource): Promise<void>;
    writeValue(data: BufferSource): Promise<void>;
  }
}

// Standard BT printer service/characteristic UUIDs (covers most brands)
const SERIAL_SERVICE_UUID  = "000018f0-0000-1000-8000-00805f9b34fb";
const SERIAL_CHAR_UUID     = "00002af1-0000-1000-8000-00805f9b34fb";

export type PrinterConnectionType = "usb" | "bluetooth" | "none";

export interface PrinterConnection {
  type: PrinterConnectionType;
  name: string;
  // USB
  port?: SerialPort;
  writer?: WritableStreamDefaultWriter<Uint8Array>;
  // Bluetooth
  device?: BluetoothDevice;
  characteristic?: BluetoothRemoteGATTCharacteristic;
}

// ── Capabilities check ───────────────────────────────────────────────────────

export function canUseSerial(): boolean {
  return typeof navigator !== "undefined" && !!navigator.serial;
}

export function canUseBluetooth(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

// ── Connect via USB / Web Serial ─────────────────────────────────────────────

export async function connectUSB(): Promise<PrinterConnection> {
  if (!navigator.serial) throw new Error("Web Serial not supported in this browser.");
  const port = await navigator.serial.requestPort({
    filters: [], // show all serial devices
  });
  await port.open({ baudRate: 9600 });
  const writer = port.writable.getWriter();
  return { type: "usb", name: "USB Printer", port, writer };
}

export async function disconnectUSB(conn: PrinterConnection): Promise<void> {
  try { conn.writer?.releaseLock(); } catch {}
  try { await conn.port?.close(); } catch {}
}

// ── Connect via Bluetooth ────────────────────────────────────────────────────

export async function connectBluetooth(): Promise<PrinterConnection> {
  if (!navigator.bluetooth) throw new Error("Web Bluetooth not supported in this browser.");

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [SERIAL_SERVICE_UUID, "battery_service"],
  });

  const server = await device.gatt!.connect();
  let characteristic: BluetoothRemoteGATTCharacteristic;

  try {
    const service = await server.getPrimaryService(SERIAL_SERVICE_UUID);
    characteristic = await service.getCharacteristic(SERIAL_CHAR_UUID);
  } catch {
    throw new Error(
      "Connected but couldn't find printer service. Make sure the printer is in pairing mode and supports BT serial."
    );
  }

  return {
    type: "bluetooth",
    name: device.name ?? "Bluetooth Printer",
    device,
    characteristic,
  };
}

export function disconnectBluetooth(conn: PrinterConnection): void {
  if (conn.device?.gatt?.connected) {
    conn.device.gatt.disconnect();
  }
}

// ── Send bytes to printer ────────────────────────────────────────────────────

async function sendBytes(conn: PrinterConnection, data: Uint8Array): Promise<void> {
  if (conn.type === "usb" && conn.writer) {
    await conn.writer.write(data);

  } else if (conn.type === "bluetooth" && conn.characteristic) {
    // BT has a 512-byte MTU limit — chunk the data
    const CHUNK = 512;
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      try {
        await conn.characteristic.writeValueWithoutResponse(chunk);
      } catch {
        await conn.characteristic.writeValue(chunk); // fallback
      }
      // Small delay between chunks to avoid buffer overflow
      await new Promise((r) => setTimeout(r, 20));
    }
  } else {
    throw new Error("No active printer connection.");
  }
}

// ── Build receipt bytes ──────────────────────────────────────────────────────

export interface ReceiptData {
  orderNumber: string;
  items: POSCartItem[];
  subtotalCents: number;
  discountCents?: number;
  totalCents: number;
  customerName?: string | null;
  customerEmail?: string | null;
  discountLabel?: string | null;
  date?: Date;
}

export function buildReceiptBytes(data: ReceiptData, width = 32): Uint8Array {
  const p = new EscPos();
  const {
    orderNumber, items, subtotalCents, discountCents = 0,
    totalCents, customerName, customerEmail, discountLabel, date,
  } = data;

  p.init()
   // ── Header ──────────────────────────────────────────────────
   .center()
   .bold(true).doubleHeight(true)
   .text("Desert Cowgirl Co.").lf()
   .doubleHeight(false).bold(false)
   .lf()
   .text(fmtDate(date)).lf()
   .text(orderNumber).lf()
   .lf()
   .divider(width)
   .left()
   // ── Items ────────────────────────────────────────────────────
   .lf();

  for (const item of items) {
    const label = item.variant_title && item.variant_title !== "Default" && item.variant_title !== ""
      ? `${item.product_title} / ${item.variant_title}`
      : item.product_title;
    // Truncate name to fit
    const name = label.length > width - 8 ? label.slice(0, width - 9) + "…" : label;
    p.row(`${item.quantity}x ${name}`, fmtMoney(item.price_cents * item.quantity), width);
  }

  p.lf()
   .divider(width)
   .lf();

  // ── Totals ───────────────────────────────────────────────────
  if (discountCents > 0) {
    p.row("Subtotal", fmtMoney(subtotalCents), width)
     .row(discountLabel ? `Discount (${discountLabel})` : "Discount", `-${fmtMoney(discountCents)}`, width);
  }

  p.bold(true)
   .row("TOTAL", fmtMoney(totalCents), width)
   .bold(false)
   .lf()
   .row("Payment", "Paid", width)
   .lf()
   .divider(width)
   // ── Footer ───────────────────────────────────────────────────
   .lf()
   .center();

  if (customerName) p.text(customerName).lf();
  if (customerEmail) p.text(customerEmail).lf();

  p.lf()
   .text("Thank you for shopping with us!").lf()
   .text("desertcowgirlco.com").lf()
   .feed(4)
   .cut();

  return p.bytes();
}

// ── Main print function ──────────────────────────────────────────────────────

export async function printReceipt(
  conn: PrinterConnection,
  data: ReceiptData,
  paperWidth: 58 | 80 = 58
): Promise<void> {
  // 58mm ≈ 32 chars, 80mm ≈ 48 chars at default font
  const charWidth = paperWidth === 80 ? 48 : 32;
  const bytes = buildReceiptBytes(data, charWidth);
  await sendBytes(conn, bytes);
}