import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913193000_tank_launch_day_two_retention.sql",
  ),
  "utf8",
);

describe("Tank launch-day retention migration", () => {
  test("scopes mission progress and uniqueness to the UTC mission day", () => {
    expect(migration).toContain("primary key (mission_id, user_id, mission_day)");
    expect(migration).toContain("(now() at time zone 'UTC')::date");
    expect(migration).toContain("on conflict (mission_id, user_id, mission_day)");
  });

  test("grants daily rewards through the idempotent reward boundary", () => {
    expect(migration).toContain("perform public.tank_grant_reward");
    expect(migration).toContain("daily-mission:%s:%s:tokens");
    expect(migration).toContain("daily-mission:%s:%s:xp");
    expect(migration).not.toContain("set tokens = tokens +");
  });

  test("adds the wired daily House Poll mission", () => {
    expect(migration).toContain("'vote_house_poll', 'community', 'Vote in the House Poll'");
    expect(migration).toContain("Cast one vote in the active House Poll today.");
  });

  test("refreshes only the original seed poll and preserves staff polls", () => {
    expect(migration).toContain("poll_launch_day_2_20260913");
    expect(migration).toContain("where public.tank_platform_settings.value ->> 'id' = 'poll_tank_direction_20260824'");
    expect(migration).toContain("'voterEligibility', 'everyone'");
  });
});
