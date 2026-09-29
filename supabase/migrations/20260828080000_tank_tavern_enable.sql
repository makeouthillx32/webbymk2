-- Tank Tavern Phase 5: rollout. All 5 phases of the plan are built and
-- verified (schema, functions, server actions, UI behind the flag, and a
-- real mutiny-quorum bug + a missing Click-Bonus implementation found and
-- fixed along the way). This is the last step: flip the kill switch.
update public.tank_platform_settings
set value = jsonb_build_object('enabled', true)
where key = 'tank_tavern_enabled';
