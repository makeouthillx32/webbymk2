import { createRoomShareCard } from "@/zones/tank/server/roomShareCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  return createRoomShareCard((await params).slug, {
    "Cache-Control": "public, max-age=20, s-maxage=20, stale-while-revalidate=60",
  });
}
