import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";

// Config-driven ClickUp status to LIMS status map
const CLICKUP_STATUS_MAP: Record<string, string> = {
  "open": "new",
  "new request": "new",
  "approved": "approved",
  "ordering standard": "ordering_standard",
  "sample prep created": "sample_prep_created",
  "in process": "in_process",
  "testing in progress": "in_process",
  "completed": "completed",
  "complete": "completed",
  "on hold": "on_hold",
  "rejected": "rejected",
  "cancelled": "cancelled",
  "canceled": "cancelled",
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");
    const secret = process.env.CLICKUP_WEBHOOK_SECRET;

    if (!secret) {
      console.error("CLICKUP_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ ok: false, error: "Webhook unavailable" }, { status: 503 });
    }
    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 401 });
    }

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const supplied = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (supplied.length !== expectedBuffer.length || !crypto.timingSafeEqual(supplied, expectedBuffer)) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const taskId = payload.task_id;

    if (event === "taskStatusUpdated" && taskId) {
      const historyItems = payload.history_items || [];
      const statusItem = historyItems.find((h: any) => h.field === "status");

      if (statusItem && statusItem.after?.status) {
        const rawClickupStatus = String(statusItem.after.status).toLowerCase().trim();
        const targetStatus = CLICKUP_STATUS_MAP[rawClickupStatus];

        if (targetStatus) {
          const supabase = createAdminClient();

          const { data: request } = await supabase
            .from("peptide_requests")
            .select("id, status")
            .eq("clickup_task_id", taskId)
            .single();

          if (request && request.status !== targetStatus) {
            await supabase
              .from("peptide_requests")
              .update({
                status: targetStatus,
                previous_status: request.status,
                updated_at: new Date().toISOString(),
              })
              .eq("id", request.id);

            await supabase.from("peptide_request_status_log").insert([
              {
                request_id: request.id,
                old_status: request.status,
                new_status: targetStatus,
                changed_by: payload.user?.email || payload.user?.username || "clickup_webhook",
                source: "clickup_webhook",
                notes: `Status updated in ClickUp to '${statusItem.after.status}'`,
              },
            ]);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
