import { handleDirectorTelemetrySimulatePost } from "@/zones/tank/server/directorTelemetryHttp";

// The director configuration screen's own detection simulator posts here.
//
// Deliberately NOT the shared-secret ingest route a real detector uses. That
// route's secret is server-only for good reason — it must never reach the
// browser bundle — so a browser-side control needs its own door. Staff
// session gated instead: a person clicking "simulate" in the console they are
// already signed into is a different trust boundary than a detector
// container, and conflating the two would mean either leaking the detector
// secret to the client or gating a debug toggle behind infrastructure meant
// for machines.

export const dynamic = "force-dynamic";
export const POST = handleDirectorTelemetrySimulatePost;
