import { NextRequest } from "next/server";
import { handleChatProviderDisconnect } from "@/zones/tank/server/externalChatHttp";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  return handleChatProviderDisconnect(provider);
}
