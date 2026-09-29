-- Chaos items: inventory items that re-skin the OBS HUD/VU overlays when used.
--
-- Catalog metadata (texture + duration) lives in tankItemCatalog.ts; these
-- rows just make the items exist and grantable. The overlay fx itself needs no
-- schema: it is written to the existing tank_overlay_settings table as the
-- "fx" overlay id, and the kill-switch / per-user cooldown live in
-- tank_platform_settings ("overlay_fx_enabled" / "overlay_fx_cooldowns").

INSERT INTO public.tank_inventory_items (slug, name, description, rarity)
VALUES
  ('chrome-spray', 'Chrome Spray Paint', 'Spray the console chrome. The HUD and VU go full brushed aluminium for a while.', 'rare'),
  ('welding-torch', 'Welding Torch', 'Bolt a heavy dark-metal plate over the overlays. Rivets included.', 'epic'),
  ('grease-gun', 'Grease Gun', 'Grease the panels. The overlays go dark metal until it dries.', 'uncommon')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      rarity = EXCLUDED.rarity;
