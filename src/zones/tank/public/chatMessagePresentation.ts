import type { ChatMessage } from "../contracts";

type PresentableChatMessage = Pick<
  ChatMessage,
  "messageType" | "role" | "user" | "userId"
>;

/**
 * Only actual console/system events receive the centered pill treatment.
 * External-provider and legacy human messages may not have a Tank auth userId.
 */
export function isSystemPillMessage(message: PresentableChatMessage): boolean {
  return (
    message.messageType === "system" ||
    message.messageType === "announcement" ||
    message.user === "CONSOLE" ||
    message.user === "SYSTEM" ||
    message.role === "system"
  );
}
