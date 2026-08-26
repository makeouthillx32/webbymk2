-- Tank brand invariant: no fish-themed reactions, items, names, or slugs.
-- Preserve item UUIDs so existing inventory ownership remains intact.

update public.tank_inventory_items
set slug = 'deed-to-tank',
    icon_url = null
where slug = 'deed-to-fishtank';

update public.tank_inventory_items
set slug = 'starter-noisemaker',
    name = 'Starter Noisemaker',
    description = 'A basic handheld noisemaker every viewer starts with once claimed.',
    icon_url = null
where slug = 'starter-fishtoy';

delete from public.tank_chat_reactions where reaction = 'fish';

alter table public.tank_chat_reactions
  drop constraint if exists tank_chat_reactions_reaction_check;

alter table public.tank_chat_reactions
  add constraint tank_chat_reactions_reaction_check
  check (reaction in ('love', 'laugh', 'wow', 'fire', 'skull'));
