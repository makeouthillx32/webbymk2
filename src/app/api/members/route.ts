// app/api/members/route.ts
import { NextResponse } from "next/server";
import { fetchProfiles } from "@/lib/storefront/members/sources/fetchProfiles";
import { fetchAuthUsers } from "@/lib/storefront/members/sources/fetchAuthUsers";
import { mergeMembers } from "@/lib/storefront/members/merge";

export async function GET() {
  try {
    // Independent jobs
    const [profiles, authUsers] = await Promise.all([
      fetchProfiles(),
      fetchAuthUsers(),
    ]);

    // Composition layer
    const members = mergeMembers({ profiles, authUsers });

    return NextResponse.json(members);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load members" },
      { status: 500 }
    );
  }
}
