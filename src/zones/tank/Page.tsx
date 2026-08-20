import type { Metadata } from "next";
import { TankExperience } from "./public/TankExperience";
import {
  getActiveMissions,
  getActiveSeason,
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

export const metadata: Metadata = {
  title: "Tank | Live rooms, cameras, and community",
  description:
    "Watch the director feed, move between public cameras, and join live rooms on Tank.",
};

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
export default async function TankPage() {
  const [
    profile,
    season,
    missions,
    leaderboard,
    clans,
    userClan,
    inventory,
    archives,
    tokenTransactions,
    cameraSnapshotRaw,
    directorState,
  ] = await Promise.all([
    withDeadline(getCurrentTankProfile().catch(() => null), null),
    withDeadline(getActiveSeason().catch(() => null), null),
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
  ]);

  const initialCameraSnapshot = cameraSnapshotRaw
    ? toPublicCameraDirectory(cameraSnapshotRaw)
    : null;

  return (
    <TankExperience
      initialCameraSnapshot={initialCameraSnapshot}
      initialProfile={profile}
      initialDirectorState={directorState}
      season={season}
      missions={missions}
      leaderboard={leaderboard}
      clans={clans}
      userClan={userClan}
      inventory={inventory}
      archives={archives}
      tokenTransactions={tokenTransactions}
    />
  );
}
