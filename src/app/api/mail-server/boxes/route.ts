// app/api/mail-server/boxes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireMailAdmin } from "@/lib/mail-admin";
import { posteio, PosteioError } from "@/lib/posteio/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireMailAdmin();
  if ("error" in guard) return guard.error;

  try {
    const boxes = await posteio.listBoxes();
    return NextResponse.json({ boxes: boxes ?? [] });
  } catch (err) {
    const status = err instanceof PosteioError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireMailAdmin();
  if ("error" in guard) return guard.error;

  const { email, passwordPlaintext, name } = await request.json();

  if (!email || !String(email).includes("@")) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }
  if (!passwordPlaintext || String(passwordPlaintext).length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const box = await posteio.createBox(String(email).toLowerCase().trim(), passwordPlaintext, name);
    return NextResponse.json({ box });
  } catch (err) {
    const status = err instanceof PosteioError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
