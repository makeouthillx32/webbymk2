import { NextRequest } from "next/server";
import { handleChatProviderCallback } from "@/zones/tank/server/externalChatHttp";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  return handleChatProviderCallback(request, provider);
}
