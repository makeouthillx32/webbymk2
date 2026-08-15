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

export const metadata: Metadata = {
  title: "Tank | Live rooms, cameras, and community",
  description:
    "Watch the director feed, move between public cameras, and join live rooms on Tank.",
};

// Real entry point for tank.unenter.live — this used to render the old
// routed HomePage; the single-page arcade-console shell (TankExperience)
// was built in a prior pass but never actually wired in here, so none of
// that work was reaching production. Fixed now: this fetches the
// gamification bones (profile/season/missions/leaderboard/clans/
// inventory/archives/token history) server-side and hands them to
// TankExperience as initial props. Everything below is still one page —
// no route changes.
export default async function TankPage() {
  const [profile, season, missions, leaderboard, clans, userClan, inventory, archives, tokenTransactions] =
    await Promise.all([
      getCurrentTankProfile(),
      getActiveSeason(),
      getActiveMissions(),
      getLeaderboard(10),
      getClans(),
      getCurrentUserClan(),
      getCurrentUserInventory(),
      getArchives(20),
      getRecentTokenTransactions(20),
    ]);

  return (
    <TankExperience
      initialProfile={profile}
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
