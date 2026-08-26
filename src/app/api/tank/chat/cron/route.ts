import { NextResponse } from "next/server";
import { schedulePeriodicChatEvents } from "@/zones/tank/server/actions";

export const dynamic = "force-dynamic";

/**
 * GET or POST /api/tank/chat/cron
 * Triggers periodic Tank chat events (Trivia questions, Camera Scavenger Quests, House Multipliers).
 * Can be called by Vercel Cron, external timer, or internal background worker every 15 minutes.
 */
export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}

async function handleCron(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("roomId") || "director";

    const result = await schedulePeriodicChatEvents(roomId);
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      roomId,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to run chat cron.",
      },
      { status: 500 },
    );
  }
}
