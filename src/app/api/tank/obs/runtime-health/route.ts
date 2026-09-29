import { handleObsRuntimeHealthGet } from "@/zones/tank/server/obsRuntimeHealth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GET = handleObsRuntimeHealthGet;
