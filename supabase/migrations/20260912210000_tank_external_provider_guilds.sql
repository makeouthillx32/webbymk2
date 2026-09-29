-- 20260912210000_tank_external_provider_guilds.sql
-- Seed official guilds / clicks for external livestream chat providers
-- (YouTube, Twitch, Kick, Trovo) so they exist as first-class guilds in Tank.

insert into public.tank_clicks (name, tag, description, banner_color)
values
  ('YouTube', 'YouTube', 'Official YouTube Live stream guild', '#ff0000'),
  ('Twitch', 'Twitch', 'Official Twitch livestream guild', '#9146ff'),
  ('Kick', 'Kick', 'Official Kick livestream guild', '#53fc18'),
  ('Trovo', 'Trovo', 'Official Trovo livestream guild', '#19d66b')
on conflict (tag) do update set
  name = excluded.name,
  description = excluded.description,
  banner_color = excluded.banner_color;
