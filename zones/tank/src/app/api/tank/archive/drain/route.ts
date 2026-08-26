import { handleDrainReport, handleDrainRun } from "@/zones/tank/server/archiveHttp";

export const dynamic = "force-dynamic";
export const GET = handleDrainReport;
export const POST = handleDrainRun;
