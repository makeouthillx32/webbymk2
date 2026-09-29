-- tank_profiles is publicly readable (player profiles: RLS policy "Public can
-- read player profiles" is USING (true)), and that exposed the billing columns
-- too: an anonymous request with the public anon key returned
-- stripe_customer_id (verified 2026-09-22). Every reader of those columns is
-- server-side with the service role, so the public roles lose them.
--
-- A column-level REVOKE is ignored while a table-level SELECT grant exists, so
-- the table-wide read is replaced by an explicit list of the non-billing
-- columns. A column added later must be granted here too to be publicly read.

revoke select on public.tank_profiles from anon, authenticated;
grant select (user_id, display_name, xp, level, tokens, created_at, updated_at, auth_provider, verified_via, email_verified, daily_streak, longest_daily_streak, daily_claim_count, last_daily_claim_at, avatar_url, display_name_confirmed_at, free_rename_used_at, season_pass_active, season_pass_purchased_at, welcome_sent_at, season_pass_tier, season_pass_expires_at, season_pass_tokens_granted_at, season_pass_status) on public.tank_profiles to anon, authenticated;
