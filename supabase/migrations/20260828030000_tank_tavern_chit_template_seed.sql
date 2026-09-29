-- Tank Tavern: starter chit template pool, so tick()'s chit generation has
-- real content from day one instead of silently never firing. Flavor drawn
-- from the Crooked Oak prototype's order list (Ale, Bread, Pie, etc.) —
-- mechanics-only reference per the spec, dialogue restyled for Tank's own
-- arcade voice rather than copied verbatim.
insert into public.tank_tavern_chit_templates (weight, dialogue, trouble_type, payload)
values
  (5, 'A regular slides an empty mug across the bar. "Another round, when you get a sec."', null, '{"item":"ale"}'),
  (4, 'Someone waves you down for a plate of something warm. "Whatever''s fastest."', null, '{"item":"bread"}'),
  (3, 'A quiet one in the corner raises two fingers. Wine, probably.', null, '{"item":"wine"}'),
  (2, 'A rowdy table wants the good stuff. "Bring out the mead!"', null, '{"item":"mead"}'),
  (1, 'Someone''s spilled their drink and is loudly blaming the bar. Smooth it over before it gets worse.', 'spill', '{}'),
  (1, 'A newcomer looks lost and hasn''t ordered anything — just needs a friendly word.', 'newcomer', '{}');
