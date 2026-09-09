import {
  handleDirectorTelemetryLiveGet,
  handleDirectorTelemetryLivePost,
} from "@/zones/tank/server/directorTelemetryHttp";

// What the director configuration screen actually watches — and, via POST,
// what feeds it.
//
// The ingest route's GET/POST are for an external detector (TouchDesigner, a
// standalone process) and are shared-secret gated. This pair is for a staff
// member's own authenticated browser tab acting as the detector — the
// director-configuration page runs real person detection against the video
// elements already rendered there and posts readings here directly, with no
// server secret ever touching client code. Split out rather than overloading
// one route with two audiences and two auth schemes.

export const dynamic = "force-dynamic";
export const GET = handleDirectorTelemetryLiveGet;
export const POST = handleDirectorTelemetryLivePost;
