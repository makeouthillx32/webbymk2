import type { Metadata } from "next";
import {
  TankExperience,
} from "./public/TankExperience";
import {
  DEFAULT_TANK_METADATA,
  type TankInitialLocation,
} from "./tankLocation";
import {
  getActiveMissions,
  getActiveSeason,
  getHouseDayStartedAt,
  getArchives,
  getClans,
  getCurrentTankProfile,
  getCurrentUserClan,
  getCurrentUserInventory,
  getLeaderboard,
  getRecentTokenTransactions,
} from "./server/gamification";
import { getCameraDirectorySnapshot } from "./server/receiverManager";
import { toPublicCameraDirectory } from "./server/publicCameraProjection";
import { getServerDirectorState } from "./server/serverDirectorEngine";
import { getAllRoomPortals } from "./server/roomPortalsCatalog";

export const metadata: Metadata = DEFAULT_TANK_METADATA;

// Nothing this page reads forces Next.js's automatic dynamic-rendering
// detection on its own (no cookies()/headers() call sits directly in this
// component — auth goes through an admin-scoped client inside
// getCurrentTankProfile), so this page was eligible to be statically
// rendered once and served from cache forever. That silently froze
// getServerDirectorState()'s result at whatever it computed the first time
// this route rendered — confirmed 2026-08-22: switchedAt and reason stayed
// byte-for-byte identical across page loads minutes apart, with the dwell
// timer correctly computing "time to tick" every time and zero errors ever
// logged, meaning the tick body simply never ran again. Every camera's
// online/offline state, the director's active room, and viewer counts all
// need to be live per request, not baked in at build/first-render time.
export const dynamic = "force-dynamic";

/**
 * Caps how long any single piece of initial data may delay the page.
 *
 * Every fetch below already swallows its own errors, but a slow backend is not
 * an error — it just never answers, and because the whole page awaits all of
 * them together, one sulking dependency held back the entire HTML response.
 * That is what "the site loads forever" looked like on a bad connection: not a
 * crash, just a page that could not start until its least important query
 * finished.
 *
 * Anything past the deadline resolves to a fallback and the client fills it in
 * afterwards. The shell is never worth delaying for a leaderboard.
 */
function withDeadline<T>(promise: Promise<T>, fallback: NoInfer<T>, ms = 2500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Real entry point for tank.unenter.live — fetches initial camera snapshot
// and gamification state server-side so video players mount and start buffering
// instantly on the very first HTML render without waiting for client fetches.
export default async function TankPage({
  // All Rooms, not Director. This is the server-rendered default for anyone
  // with no saved view — a new visitor, a new tab, a cleared browser. Landing
  // in a single directed feed hides the other six rooms behind a click, and
  // it was also overriding the restored view on the client.
  initialLocation = { mode: "grid" },
}: {
  initialLocation?: TankInitialLocation;
} = {}) {
  const resolvedLocation = initialLocation;
  const [
    profile,
    season,
    houseDayStartedAt,
    missions,
    leaderboard,
    clans,
    userClan,
    inventory,
    archives,
    tokenTransactions,
    cameraSnapshotRaw,
    directorState,
    roomPortals,
  ] = await Promise.all([
    withDeadline(getCurrentTankProfile().catch(() => null), null),
    withDeadline(getActiveSeason().catch(() => null), null),
    withDeadline(getHouseDayStartedAt().catch(() => null), null),
    withDeadline(getActiveMissions().catch(() => []), []),
    withDeadline(getLeaderboard(10).catch(() => []), []),
    withDeadline(getClans().catch(() => []), []),
    withDeadline(getCurrentUserClan().catch(() => null), null),
    withDeadline(getCurrentUserInventory().catch(() => []), []),
    withDeadline(getArchives(20).catch(() => []), []),
    withDeadline(getRecentTokenTransactions(20).catch(() => []), []),
    // The camera snapshot is the one most likely to be slow (it calls out to
    // the receiver manager) and the one the page least needs to wait for: the
    // client refreshes it moments later anyway.
    withDeadline(getCameraDirectorySnapshot().catch(() => null), null, 2000),
    withDeadline(getServerDirectorState().catch(() => null), null, 2000),
    withDeadline(getAllRoomPortals().catch(() => []), [], 2000),
  ]);

  const initialCameraSnapshot = cameraSnapshotRaw
    ? toPublicCameraDirectory(cameraSnapshotRaw)
    : null;

  return (
    <>
      {/* Early inline script: scrubs legacy UI cookies before client JS / hydration runs */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var k=['tank_mobile_chat_size','tank_room_mode','tank_room_slug','tank_chat_target','tank_room_origin','tank_background_theme'];var h=window.location.hostname;var d=['','; domain='+h,'; domain=.'+h,'; domain=.unenter.live'];for(var i=0;i<k.length;i++){for(var j=0;j<d.length;j++){document.cookie=k[i]+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'+d[j]+'; SameSite=Lax';}}}catch(e){}})();`,
        }}
      />
      <TankExperience
        initialLocation={resolvedLocation}
        initialCameraSnapshot={initialCameraSnapshot}
        initialProfile={profile}
        initialDirectorState={directorState}
        initialRoomPortals={roomPortals}
        season={season}
        houseDayStartedAt={houseDayStartedAt}
        missions={missions}
        leaderboard={leaderboard}
        clans={clans}
        userClan={userClan}
        inventory={inventory}
        archives={archives}
        tokenTransactions={tokenTransactions}
      />
    </>
  );
}
