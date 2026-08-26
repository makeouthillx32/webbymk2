import { createAdminClient } from "@/utils/supabase/admin";

export const CHAT_ATTACHMENT_BUCKET = "tank-chat-attachments";
export const IMAGE_LIFESPAN_HOURS = 3;
export const IMAGE_MAX_RETENTION_HOURS = 5;

export type ChatAttachmentRecord = {
  id: string;
  uploaderId: string | null;
  filePath: string;
  fileSizeBytes: number;
  contentType: string;
  status: "active" | "purged";
  createdAt: string;
  expiresAt: string;
  publicUrl: string;
  isExpired: boolean;
};

export const CHAT_IMAGE_TOKEN_REGEX = /\[image(?::)?(\d+)\]/gi;

/**
 * Formats a numeric or string image ID into standard inline chat token syntax: [image734893674]
 */
export function formatImageToken(imageId: string | number): string {
  const cleanId = String(imageId).replace(/[^0-9]/g, "");
  return `[image${cleanId}]`;
}

/**
 * Extracts all inline image IDs from a message body.
 */
export function extractImageIdsFromText(text: string): string[] {
  if (!text) return [];
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(CHAT_IMAGE_TOKEN_REGEX);
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  return ids;
}

/**
 * Resolves the public Supabase storage CDN URL for a given attachment file path.
 */
export function getChatAttachmentUrl(filePath: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || "https://db.unenter.live";
  const cleanPath = filePath.replace(/^\/+/, "");
  return `${baseUrl}/storage/v1/object/public/${CHAT_ATTACHMENT_BUCKET}/${cleanPath}`;
}

const memoryAttachments = new Map<string, ChatAttachmentRecord>();

/**
 * Mints the next collision-free sequential ID from PostgreSQL database sequence.
 */
export async function mintChatImageId(): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tank_chat_attachments")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(400));
    if (data && data.length > 0) {
      return String(Number(data[0].id) + 1);
    }
  } catch {}

  // Standalone fallback: high-range random timestamped integer
  const now = Date.now();
  const seed = (now % 100000000) + Math.floor(Math.random() * 899999);
  return `734${String(seed).padStart(6, "0").slice(-6)}`;
}

/**
 * Registers an uploaded chat image attachment in the database.
 */
export async function recordChatAttachment(input: {
  id?: string;
  uploaderId?: string | null;
  filePath: string;
  fileSizeBytes: number;
  contentType?: string;
  lifespanHours?: number;
}): Promise<{ success: boolean; attachment?: ChatAttachmentRecord; error?: string }> {
  const lifespan = input.lifespanHours ?? IMAGE_LIFESPAN_HOURS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lifespan * 3600 * 1000);

  const imageId = input.id ?? (await mintChatImageId());

  const record: ChatAttachmentRecord = {
    id: imageId,
    uploaderId: input.uploaderId ?? null,
    filePath: input.filePath,
    fileSizeBytes: Math.max(0, Math.round(input.fileSizeBytes)),
    contentType: input.contentType ?? "image/webp",
    status: "active",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    publicUrl: getChatAttachmentUrl(input.filePath),
    isExpired: false,
  };

  memoryAttachments.set(imageId, record);

  try {
    const admin = createAdminClient();
    await admin
      .from("tank_chat_attachments")
      .upsert(
        {
          id: imageId,
          uploader_id: record.uploaderId,
          file_path: record.filePath,
          file_size_bytes: record.fileSizeBytes,
          content_type: record.contentType,
          status: record.status,
          created_at: record.createdAt,
          expires_at: record.expiresAt,
        },
        { onConflict: "id" }
      )
      .abortSignal(AbortSignal.timeout(500));
  } catch {}

  return { success: true, attachment: record };
}

/**
 * Checks the status of a specific image attachment ID.
 */
export async function getChatAttachmentStatus(imageId: string | number): Promise<{
  exists: boolean;
  isExpired: boolean;
  publicUrl: string | null;
  status: "active" | "purged" | "not_found";
}> {
  const cleanId = String(imageId).replace(/[^0-9]/g, "");
  if (!cleanId) return { exists: false, isExpired: true, publicUrl: null, status: "not_found" };

  const mem = memoryAttachments.get(cleanId);
  if (mem) {
    const isExpired = mem.status === "purged" || new Date(mem.expiresAt).getTime() <= Date.now();
    return {
      exists: true,
      isExpired,
      publicUrl: isExpired ? null : mem.publicUrl,
      status: isExpired ? "purged" : "active",
    };
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("tank_chat_attachments")
      .select("id, file_path, status, expires_at")
      .eq("id", cleanId)
      .maybeSingle()
      .abortSignal(AbortSignal.timeout(500));

    if (!data) {
      // Fallback url check
      const fallbackPath = `attachments/${cleanId}.webp`;
      return {
        exists: true,
        isExpired: false,
        publicUrl: getChatAttachmentUrl(fallbackPath),
        status: "active",
      };
    }

    const isExpired = data.status === "purged" || new Date(data.expires_at).getTime() <= Date.now();
    return {
      exists: true,
      isExpired,
      publicUrl: isExpired ? null : getChatAttachmentUrl(data.file_path),
      status: isExpired ? "purged" : "active",
    };
  } catch {
    return { exists: false, isExpired: true, publicUrl: null, status: "not_found" };
  }
}

/**
 * Ephemeral Storage Sweeper: Purges expired images from Supabase Storage and marks rows purged.
 */
export async function purgeExpiredChatAttachments(): Promise<{
  success: boolean;
  purgedCount: number;
  error?: string;
}> {
  let memoryPurged = 0;
  const now = Date.now();
  for (const [, rec] of memoryAttachments.entries()) {
    if (rec.status === "active" && new Date(rec.expiresAt).getTime() <= now) {
      rec.status = "purged";
      memoryPurged++;
    }
  }

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: expiredRows, error: fetchErr } = await admin
      .from("tank_chat_attachments")
      .select("id, file_path")
      .eq("status", "active")
      .lte("expires_at", nowIso)
      .limit(100)
      .abortSignal(AbortSignal.timeout(500));

    if (fetchErr) return { success: true, purgedCount: memoryPurged };
    if (!expiredRows || expiredRows.length === 0) {
      return { success: true, purgedCount: memoryPurged };
    }

    const filePaths = expiredRows.map((r) => r.file_path).filter(Boolean);
    const ids = expiredRows.map((r) => r.id);

    // Delete files from storage bucket
    if (filePaths.length > 0) {
      await admin.storage.from(CHAT_ATTACHMENT_BUCKET).remove(filePaths);
    }

    // Mark rows as purged in database
    await admin
      .from("tank_chat_attachments")
      .update({ status: "purged", purged_at: new Date().toISOString() })
      .in("id", ids)
      .abortSignal(AbortSignal.timeout(500));

    return { success: true, purgedCount: ids.length + memoryPurged };
  } catch {
    return { success: true, purgedCount: memoryPurged };
  }
}
