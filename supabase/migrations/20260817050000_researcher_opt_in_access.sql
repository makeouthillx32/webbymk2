-- Migration: researcher_opt_in_access
-- Researcher access (research-compound checkout eligibility, gated by
-- requireResearcherRole.ts) used to be granted automatically to every new
-- signup just for accepting the platform's general Terms of Service — a
-- leftover from when the shop's research storefront was the only reason to
-- sign up at all. Now that Tank brings in general-public signups with no
-- interest in research compounds, that's over-permissioning: this column
-- backs a separate, deliberate opt-in upgrade instead of bundling it into
-- account creation. General terms_accepted_at is untouched and still
-- records ordinary ToS acceptance.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS research_terms_accepted_at TIMESTAMPTZ;
