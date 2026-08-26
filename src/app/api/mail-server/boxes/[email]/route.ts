// app/api/mail-server/boxes/[email]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireMailAdmin } from "@/lib/mail-admin";
import { posteio, PosteioError } from "@/lib/posteio/client";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const guard = await requireMailAdmin();
  if ("error" in guard) return guard.error;

  const { email } = await params;
  const body = await request.json();
  const patch: { name?: string; disabled?: boolean; passwordPlaintext?: string } = {};

  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
  if (typeof body.passwordPlaintext === "string" && body.passwordPlaintext.length > 0) {
    if (body.passwordPlaintext.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    patch.passwordPlaintext = body.passwordPlaintext;
  }

  try {
    const box = await posteio.updateBox(decodeURIComponent(email), patch);
    return NextResponse.json({ box });
  } catch (err) {
    const status = err instanceof PosteioError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const guard = await requireMailAdmin();
  if ("error" in guard) return guard.error;

  const { email } = await params;
  try {
    await posteio.deleteBox(decodeURIComponent(email));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof PosteioError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
