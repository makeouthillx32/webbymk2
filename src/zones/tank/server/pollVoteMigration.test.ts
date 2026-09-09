import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../../../supabase/migrations/20260901191932_tank_participant_identity_votes.sql",
  ),
  "utf8",
).toLowerCase();

describe("Tank poll participation migration", () => {
  it("enforces one vote per poll and participant in Postgres", () => {
    expect(migration).toContain(
      "primary key (poll_id, voter_key)",
    );
    expect(migration).toContain(
      "on conflict (poll_id, voter_key) do nothing",
    );
    expect(migration).toContain("you have already voted in this poll");
  });

  it("keeps the vote ledger private and the rpc server-only", () => {
    expect(migration).toContain(
      "alter table public.tank_poll_votes enable row level security",
    );
    expect(migration).toContain(
      "revoke all on table public.tank_poll_votes from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.tank_cast_poll_vote(text, text, integer)",
    );
    expect(migration).toContain("to service_role");
  });

  it("backfills the active poll before accepting new identities", () => {
    expect(migration).toContain("jsonb_each(");
    expect(migration).toContain("legacy_guest");
  });

  it("enforces members-only polls inside the database function", () => {
    expect(migration).toContain("votereligibility");
    expect(migration).toContain("v_voter_kind <> 'member'");
    expect(migration).toContain("sign in with a verified member account");
  });
});
