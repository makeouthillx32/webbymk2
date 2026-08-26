// app/api/creator/cashout/route.ts
// Customer-facing: request a cash-out once balance clears the minimum.
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendAdminAlert } from "@/lib/mail/sendAdminAlert";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: creator, error: creatorError } = await admin
    .from("creators")
    .select("id, profiles ( display_name, first_name, last_name, email )")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (creatorError) return NextResponse.json({ error: creatorError.message }, { status: 500 });
  if (!creator) return NextResponse.json({ error: "You're not set up as a creator." }, { status: 403 });

  const { data, error } = await admin.rpc("request_creator_cashout", {
    p_creator_id: creator.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Best-effort — a creator's cash-out request is only useful if a human
  // actually sees it. Non-fatal: the request itself already succeeded.
  try {
    const profile = (creator as any).profiles;
    const name =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
      profile?.display_name ||
      profile?.email ||
      "A creator";
    const amount = data?.amount_cents != null ? `$${(data.amount_cents / 100).toFixed(2)}` : "";
    await sendAdminAlert({
      subject: `Cash-out requested — ${name}`,
      message: `${name} requested a cash-out of ${amount}. Pay them manually, then mark it paid (or failed) from Dashboard → Labs → Creators → Cash-out requests.`,
      actionUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.unenter.live"}/dashboard/settings/creators`,
    });
  } catch (alertErr) {
    console.error("[mail] Failed to send admin cash-out alert:", alertErr);
  }

  return NextResponse.json({ cashout: data });
}
