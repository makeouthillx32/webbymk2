import { NextRequest } from "next/server";
import { handleChatProviderConnect } from "@/zones/tank/server/externalChatHttp";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  return handleChatProviderConnect(provider);
}
