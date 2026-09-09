import {
  handleDirectorPilotGet,
  handleDirectorPilotPost,
} from "@/zones/tank/server/directorPilotHttp";

export const dynamic = "force-dynamic";

export const GET = handleDirectorPilotGet;
export const POST = handleDirectorPilotPost;
