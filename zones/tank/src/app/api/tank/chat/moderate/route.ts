import { handleChatModerationGet, handleChatModerationPost } from "@/zones/tank/server/chatModerationHttp";

export const dynamic = "force-dynamic";
export const GET = handleChatModerationGet;
export const POST = handleChatModerationPost;
