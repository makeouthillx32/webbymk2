import { NextResponse } from "next/server";
import { getTrendingGiphyGifs } from "@/zones/tank/server/chatGifs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || "24");
    const rating = searchParams.get("rating") || "g";

    const result = await getTrendingGiphyGifs(limit, rating);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, data: [], error: err instanceof Error ? err.message : "Trending error" },
      { status: 500 }
    );
  }
}
