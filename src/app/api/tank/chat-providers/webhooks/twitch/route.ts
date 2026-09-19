import { NextRequest } from "next/server";
import { handleTwitchChatWebhook } from "@/zones/tank/server/externalChatHttp";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleTwitchChatWebhook(request);
}
