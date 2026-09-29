-- Tank: backfill missing tank_inventory_items rows for chat RNG commands.
--
-- Confirmed live 2026-08-31 by querying tank_inventory_items directly and
-- diffing every slug in chatRngEvents.ts's ITEM_ACTION_DEFINITIONS against
-- it: these five slugs are referenced by real, currently-live gameplay code
-- but have no row here at all. tank_grant_inventory_item() (see
-- 20260828000000_tank_tavern_reward_and_inventory_boundary.sql) returns
-- {success:false, error:'unknown or inactive item'} — not a throw — for a
-- missing slug, so every grant attempt against one of these silently failed
-- while the calling chat command still broadcast a success message and
-- awarded XP. Worst confirmed impact: "first-aid-kit" is /unbox's "rare"
-- tier, roll 0.30-0.60 — 30% of every /unbox roll — and is also the default
-- 3-of-a-kind bonus drop in /slots.
--
-- "pet-whistle" / "cat-laser" / "pumpkin" / "slime-bomb" are not reachable
-- from /unbox or /slots today (those only roll first-aid-kit, lightsaber,
-- royal-jelly, deed-to-tank, or battery), but they're real gaps in the same
-- catalog-drift class — fixed here too since it's the same one-row cost per
-- item and prevents the next person from re-discovering this bug the first
-- time /use or an admin grant targets one of them.
--
-- Icon URLs match ITEM_ACTION_DEFINITIONS in chatRngEvents.ts exactly, incl.
-- the two that intentionally reuse an existing icon rather than a dedicated
-- one (cat-laser -> lightsaber.png, pumpkin/slime-bomb -> fucked-up-shit.png
-- — that's existing app-code data, not something introduced here).
--
-- Known follow-up, not fixed here: public/images/tank-items/pet-whistle.png
-- does not exist on disk yet (confirmed — only battery, fucked-up-shit, and
-- lightsaber assets exist under that folder). The item will grant correctly
-- once this migration lands; it'll just render with a broken/fallback icon
-- client-side until that asset is added separately.

insert into public.tank_inventory_items
  (slug, name, description, rarity, icon_url, is_active)
values
  ('first-aid-kit', 'First Aid Kit',
   'Bandages and antiseptic. Someone''s getting stitched up.',
   'common', '/images/tank-items/battery.png', true),
  ('pet-whistle', 'Pet Whistle',
   'A high-frequency whistle only the house pets can hear.',
   'rare', '/images/tank-items/pet-whistle.png', true),
  ('cat-laser', 'Cat Laser Pointer',
   'A dancing red dot. Mochi and Buster take it very seriously.',
   'rare', '/images/tank-items/lightsaber.png', true),
  ('pumpkin', 'Pumpkin',
   'Ripe for kicking. Goo and seeds not included, but likely.',
   'uncommon', '/images/tank-items/fucked-up-shit.png', true),
  ('slime-bomb', 'Slime Bomb',
   'Viscous, green, and one throw away from someone''s shirt.',
   'epic', '/images/tank-items/fucked-up-shit.png', true)
on conflict (slug) do nothing;
