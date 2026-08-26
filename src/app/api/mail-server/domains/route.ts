// app/api/mail-server/domains/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireMailAdmin } from "@/lib/mail-admin";
import { posteio, PosteioError } from "@/lib/posteio/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireMailAdmin();
  if ("error" in guard) return guard.error;

  try {
    const domains = await posteio.listDomains();
    return NextResponse.json({ domains: domains ?? [] });
  } catch (err) {
    const status = err instanceof PosteioError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireMailAdmin();
  if ("error" in guard) return guard.error;

  const { name } = await request.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "Domain name is required" }, { status: 400 });
  }

  try {
    const domain = await posteio.createDomain(String(name).trim().toLowerCase());
    return NextResponse.json({ domain });
  } catch (err) {
    const status = err instanceof PosteioError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
