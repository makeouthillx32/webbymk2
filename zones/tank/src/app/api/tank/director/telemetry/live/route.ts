import {
  handleDirectorTelemetryLiveGet,
  handleDirectorTelemetryLivePost,
} from "@/zones/tank/server/directorTelemetryHttp";

export const dynamic = "force-dynamic";
export const GET = handleDirectorTelemetryLiveGet;
export const POST = handleDirectorTelemetryLivePost;
