UPDATE auth.users 
SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"admin"'),
    raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"admin"')
WHERE email = 'admin@unenter.live';

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@unenter.live';

UPDATE public.tank_profiles
SET role = 'admin'
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'admin@unenter.live');
