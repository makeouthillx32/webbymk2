import {
  handleDirectorOverrideGet,
  handleDirectorOverridePost,
  handleDirectorOverrideDelete,
} from "@/zones/tank/server/directorOverrideHttp";

export const dynamic = "force-dynamic";

export const GET = handleDirectorOverrideGet;
export const POST = handleDirectorOverridePost;
export const DELETE = handleDirectorOverrideDelete;
