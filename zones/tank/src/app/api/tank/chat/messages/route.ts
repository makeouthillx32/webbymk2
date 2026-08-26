import { handleChatMessagesGet, handleChatMessagesPost } from "@/zones/tank/server/chatHttp";

export const dynamic = "force-dynamic";
export const GET = handleChatMessagesGet;
export const POST = handleChatMessagesPost;
