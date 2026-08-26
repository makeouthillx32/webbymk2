-- Migration: Add auth provider and verification tracking to tank_profiles and profiles

ALTER TABLE public.tank_profiles 
ADD COLUMN IF NOT EXISTS auth_provider text DEFAULT 'email',
ADD COLUMN IF NOT EXISTS verified_via text DEFAULT 'unverified',
ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS auth_provider text DEFAULT 'email',
ADD COLUMN IF NOT EXISTS verified_via text DEFAULT 'unverified';
