import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = process.env.STATUS_HEALTH_URLS;
  const urls = configured ? configured.split(",").map((url) => url.trim()).filter(Boolean) : [];
  const checks = await Promise.all(urls.map(async (url) => {
    const started = Date.now();
    try {
      const response = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) });
      return { url, status: response.ok ? "operational" : "degraded", response: response.status, latencyMs: Date.now() - started };
    } catch {
      return { url, status: "down", response: null, latencyMs: Date.now() - started };
    }
  }));
  const status = checks.some((check) => check.status === "down") ? "down" : checks.some((check) => check.status === "degraded") ? "degraded" : "operational";
  return NextResponse.json({ status, checks, checkedAt: new Date().toISOString() });
}
