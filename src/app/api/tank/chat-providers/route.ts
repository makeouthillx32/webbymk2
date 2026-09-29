import { NextResponse } from "next/server";
import { handleChatProvidersGet } from "@/zones/tank/server/externalChatHttp";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleChatProvidersGet();
}
