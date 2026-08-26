import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Database-triggered clip capture is retired.",
      managedBy: "mediamtx-path-worker",
    },
    { status: 410 },
  );
}
