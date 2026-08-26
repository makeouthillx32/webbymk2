// Handlers live in @/zones/tank/server/archiveHttp — see that file for why they
// are not defined in an app/ directory.
import { handleSegmentComplete } from "@/zones/tank/server/archiveHttp";

export const dynamic = "force-dynamic";
export const POST = handleSegmentComplete;
