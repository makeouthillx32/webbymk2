import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  CHAT_ATTACHMENT_BUCKET,
  mintChatImageId,
  recordChatAttachment,
  getChatAttachmentStatus,
  purgeExpiredChatAttachments,
  formatImageToken,
  getChatAttachmentUrl,
} from "./chatAttachments";

export const dynamic = "force-dynamic";

/**
 * POST /api/tank/chat/attachments/upload
 */
export async function handleChatAttachmentUpload(req: Request) {
  try {
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {}

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No image file provided." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Image exceeds 10MB limit." }, { status: 400 });
    }

    const imageId = await mintChatImageId();
    const mime = file.type || "image/webp";
    const ext = mime.includes("png")
      ? "png"
      : mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : mime.includes("gif")
      ? "gif"
      : "webp";

    const filePath = `attachments/${imageId}.${ext}`;
    const admin = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Upload to Supabase Storage
    try {
      await admin.storage
        .from(CHAT_ATTACHMENT_BUCKET)
        .upload(filePath, buffer, {
          contentType: mime,
          upsert: true,
        });

      // Also mirror as .webp if uploaded as non-webp so all extension variants resolve
      if (ext !== "webp") {
        await admin.storage
          .from(CHAT_ATTACHMENT_BUCKET)
          .upload(`attachments/${imageId}.webp`, buffer, {
            contentType: mime,
            upsert: true,
          })
          .catch(() => {});
      }
    } catch (storageErr) {
      console.warn("[chatAttachmentsHttp] Storage upload warning:", storageErr);
    }

    // 2. Record attachment in database
    const recordResult = await recordChatAttachment({
      id: imageId,
      uploaderId: userId,
      filePath,
      fileSizeBytes: file.size,
      contentType: mime,
      lifespanHours: 3,
    });

    const publicUrl = getChatAttachmentUrl(filePath);
    const token = formatImageToken(imageId);

    return NextResponse.json({
      success: true,
      imageId,
      token,
      filePath,
      publicUrl,
      attachment: recordResult.attachment ?? {
        id: imageId,
        uploaderId: userId,
        filePath,
        fileSizeBytes: file.size,
        contentType: mime,
        status: "active",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
        publicUrl,
        isExpired: false,
      },
    });
  } catch (err) {
    console.error("[chatAttachmentsHttp] Upload handler error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to upload image." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tank/chat/attachments/status?id=734893674
 */
export async function handleChatAttachmentStatus(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing image id." }, { status: 400 });
    }

    const status = await getChatAttachmentStatus(id);
    return NextResponse.json({ success: true, ...status });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to fetch attachment status." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tank/chat/attachments/purge
 */
export async function handleChatAttachmentPurge() {
  try {
    const result = await purgeExpiredChatAttachments();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Purge execution failed." },
      { status: 500 }
    );
  }
}
