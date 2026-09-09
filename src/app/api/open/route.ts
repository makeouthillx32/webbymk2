// src/app/api/open/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const doc = url.searchParams.get("doc") || "";
    const redirect = url.searchParams.get("redirect") === "true";

    // In local development, OpenKnowledge preview runs on localhost.
    // Default fallback or active session port.
    const previewBase = process.env.OPEN_KNOWLEDGE_PREVIEW_URL || "http://127.0.0.1:58248";
    const targetUrl = doc ? `${previewBase}/#/${doc}` : previewBase;

    if (redirect) {
      return NextResponse.redirect(targetUrl);
    }

    return NextResponse.json({
      url: targetUrl,
      vault: "vault",
      status: "ready",
      openCommand: `npx @inkeep/open-knowledge open ${doc ? `vault/${doc}.md` : "vault"}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
