import { NextResponse } from "next/server";
import { getServerDirectorState } from "./serverDirectorEngine";
import { getDirectorProgramSnapshot } from "./directorProgram";

export async function handleDirectorStateGet() {
  try {
    const [state, program] = await Promise.all([
      getServerDirectorState(),
      getDirectorProgramSnapshot(),
    ]);
    return NextResponse.json({ success: true, state, program });
  } catch (error) {
    console.error("[DirectorState] failed to read shared state:", error);
    return NextResponse.json({ error: "Director state unavailable" }, { status: 503 });
  }
}
