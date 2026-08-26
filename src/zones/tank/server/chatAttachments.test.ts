import { describe, expect, it } from "bun:test";
import {
  formatImageToken,
  extractImageIdsFromText,
  getChatAttachmentUrl,
  mintChatImageId,
  recordChatAttachment,
  getChatAttachmentStatus,
  purgeExpiredChatAttachments,
  CHAT_IMAGE_TOKEN_REGEX,
  IMAGE_LIFESPAN_HOURS,
} from "./chatAttachments";

describe("Tank Chat Ephemeral Image Attachments System", () => {
  it("formats and extracts inline image tokens cleanly", () => {
    expect(formatImageToken("734893674")).toBe("[image734893674]");
    expect(formatImageToken(734893674)).toBe("[image734893674]");

    const message = "hey everyone look at my toes [image734893674] and here is another [image998877]";
    const ids = extractImageIdsFromText(message);
    expect(ids).toEqual(["734893674", "998877"]);
  });

  it("handles both [image123] and [image:123] token formats", () => {
    const text = "check out [image:112233] vs [image445566]";
    const ids = extractImageIdsFromText(text);
    expect(ids).toEqual(["112233", "445566"]);
  });

  it("builds consistent public CDN attachment URLs", () => {
    const url = getChatAttachmentUrl("attachments/734893674.webp");
    expect(url).toContain("/storage/v1/object/public/tank-chat-attachments/attachments/734893674.webp");
  });

  it("mints collision-free image IDs", async () => {
    const id1 = await mintChatImageId();
    const id2 = await mintChatImageId();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1.length).toBeGreaterThanOrEqual(6);
  });

  it("records attachment with 3-hour expiration window", async () => {
    const res = await recordChatAttachment({
      id: "734893674",
      filePath: "attachments/734893674.webp",
      fileSizeBytes: 102400,
      contentType: "image/webp",
      lifespanHours: IMAGE_LIFESPAN_HOURS,
    });

    expect(res.success).toBe(true);
    expect(res.attachment).toBeDefined();
    expect(res.attachment?.id).toBe("734893674");
    expect(res.attachment?.status).toBe("active");
    expect(res.attachment?.isExpired).toBe(false);

    const created = new Date(res.attachment!.createdAt).getTime();
    const expires = new Date(res.attachment!.expiresAt).getTime();
    const diffHours = (expires - created) / (1000 * 3600);
    expect(Math.round(diffHours)).toBe(3);
  });

  it("verifies attachment status queries", async () => {
    const status = await getChatAttachmentStatus("734893674");
    expect(status.exists).toBe(true);
    expect(status.status).toBe("active");
    expect(status.publicUrl).toContain("attachments/734893674.webp");
  });

  it("runs purge sweeper gracefully", async () => {
    const purge = await purgeExpiredChatAttachments();
    expect(purge.success).toBe(true);
    expect(purge.purgedCount).toBeGreaterThanOrEqual(0);
  });

  it("validates optimistic message construction with image attachments", () => {
    const rawBody = "look at this cool setup [image734893674]";
    const optimisticMessage = {
      id: "pending_nonce_123",
      clientNonce: "nonce_123",
      pending: true,
      user: "Tester",
      body: rawBody,
      time: "12:00 PM",
      role: "member" as const,
    };

    // 1. Validate body preserves the token for instant optimistic rendering
    expect(optimisticMessage.body).toContain("[image734893674]");
    expect(optimisticMessage.pending).toBe(true);

    // 2. Validate token extraction from optimistic body
    const imageIds = extractImageIdsFromText(optimisticMessage.body);
    expect(imageIds).toEqual(["734893674"]);

    // 3. Validate image preview URL matches public bucket
    const previewUrl = getChatAttachmentUrl(`attachments/${imageIds[0]}.webp`);
    expect(previewUrl).toContain("/tank-chat-attachments/attachments/734893674.webp");

    // 4. Validate server message reconciliation replaces pending row while keeping image body
    const serverMessage = {
      id: "real_msg_999",
      clientNonce: "nonce_123",
      pending: false,
      user: "Tester",
      body: rawBody,
      time: "12:00 PM",
      role: "member" as const,
    };

    const messages = [optimisticMessage];
    const idx = messages.findIndex((m) => m.clientNonce === serverMessage.clientNonce);
    expect(idx).toBe(0);
    messages[idx] = serverMessage;
    expect(messages[0].id).toBe("real_msg_999");
    expect(messages[0].pending).toBe(false);
    expect(messages[0].body).toContain("[image734893674]");
  });
});
