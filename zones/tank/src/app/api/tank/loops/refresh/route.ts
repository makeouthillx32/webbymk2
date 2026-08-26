import { NextResponse } from "next/server";

const BODY = {
  error: "Manual clip capture is retired.",
  managedBy: "mediamtx-path-worker",
};

export async function GET() {
  return NextResponse.json(BODY, { status: 410 });
}

export async function POST() {
  return NextResponse.json(BODY, { status: 410 });
}
