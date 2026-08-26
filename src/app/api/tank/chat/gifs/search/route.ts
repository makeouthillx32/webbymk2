import { NextResponse } from "next/server";
import { searchGiphyGifs } from "@/zones/tank/server/chatGifs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const limit = Number(searchParams.get("limit") || "24");
    const rating = searchParams.get("rating") || "g";

    const result = await searchGiphyGifs(q, limit, rating);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, data: [], error: err instanceof Error ? err.message : "Search error" },
      { status: 500 }
    );
  }
}
