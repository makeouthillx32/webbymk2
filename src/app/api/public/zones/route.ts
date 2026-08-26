import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

type ZoneRow = {
  key: string;
  label: string;
  domain: string;
  sort_order: number;
  footer_pinned: boolean;
};

const HIDDEN_KEYS = new Set([
  "unenter",
  "auth",
  "logs",
  "logz",
]);

function toHref(domain: string) {
  return domain.startsWith("http://") || domain.startsWith("https://")
    ? domain
    : `https://${domain}`;
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("zones")
      .select("key,label,domain,sort_order,footer_pinned")
      .eq("enabled", true)
      .eq("footer_pinned", true)
      .order("sort_order", { ascending: true })
      .returns<ZoneRow[]>();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const zones = (data ?? [])
      .filter((zone) => !HIDDEN_KEYS.has(zone.key))
      .map(({ key, label, domain }) => ({
        key,
        label,
        domain,
        href: toHref(domain),
      }));

    return NextResponse.json(
      { ok: true, data: zones },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
