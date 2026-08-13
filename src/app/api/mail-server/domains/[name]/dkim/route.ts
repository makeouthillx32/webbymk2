// app/api/mail-server/domains/[name]/dkim/route.ts
// GET reads the current DKIM key (404s if none yet). PUT generates one —
// poste.io returns the selector + public key; the TXT record still has to
// be added at your DNS provider by hand.
import { NextResponse } from "next/server";
import { requireMailAdmin } from "@/lib/mail-admin";
import { posteio, PosteioError } from "@/lib/posteio/client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const guard = await requireMailAdmin();
  if ("error" in guard) return guard.error;

  const { name } = await params;
  try {
    const dkim = await posteio.getDomainDkim(decodeURIComponent(name));
    return NextResponse.json({ dkim });
  } catch (err) {
    const status = err instanceof PosteioError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function PUT(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const guard = await requireMailAdmin();
  if ("error" in guard) return guard.error;

  const { name } = await params;
  try {
    const dkim = await posteio.generateDomainDkim(decodeURIComponent(name));
    return NextResponse.json({ dkim });
  } catch (err) {
    const status = err instanceof PosteioError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
