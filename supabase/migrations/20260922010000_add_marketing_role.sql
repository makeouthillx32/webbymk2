-- Add 'marketing' as a valid profile role, following the same pattern as
-- 20260822001500_profiles_moderator_role_and_clearance.sql (moderator).
-- Scope for now: content across zones (landing/blog) + mail send-as via the
-- new "marketing" mail identity — never billing/orders/users/infra, which
-- stay admin-only. See requireRole() in src/lib/require-admin.ts and the
-- allowedRoles param on src/lib/adminGuard.ts's requireAdmin().

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'moderator'::text, 'member'::text, 'guest'::text, 'researcher'::text, 'affiliate'::text, 'marketing'::text]));

INSERT INTO public.roles (id, role, color)
VALUES ('marketing', 'marketing', '#ec4899')
ON CONFLICT (id) DO NOTHING;
