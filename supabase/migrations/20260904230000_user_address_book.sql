-- Migration: 20260904230000_user_address_book.sql
-- Create user_address_book table with nicknames, addresses, and defaults

CREATE TABLE IF NOT EXISTS public.user_address_book (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    full_name TEXT NOT NULL,
    company TEXT,
    line1 TEXT NOT NULL,
    line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'US',
    phone TEXT,
    is_default_shipping BOOLEAN DEFAULT false,
    is_default_billing BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_address_book_user_id ON public.user_address_book(user_id);

ALTER TABLE public.user_address_book ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own addresses" ON public.user_address_book;
CREATE POLICY "Users can select their own addresses"
    ON public.user_address_book FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert their own addresses" ON public.user_address_book;
CREATE POLICY "Users can insert their own addresses"
    ON public.user_address_book FOR INSERT
    WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update their own addresses" ON public.user_address_book;
CREATE POLICY "Users can update their own addresses"
    ON public.user_address_book FOR UPDATE
    USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete their own addresses" ON public.user_address_book;
CREATE POLICY "Users can delete their own addresses"
    ON public.user_address_book FOR DELETE
    USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

GRANT ALL ON public.user_address_book TO authenticated;
GRANT ALL ON public.user_address_book TO service_role;
GRANT ALL ON public.user_address_book TO anon;

-- Seed initial address book records for Tyler Burns
INSERT INTO public.user_address_book (user_id, nickname, full_name, company, line1, line2, city, state, postal_code, country, phone, is_default_shipping, is_default_billing)
SELECT id, 'Primary Facility', 'Tyler Burns', 'Unenter Labs', '1619 N Chaparral Dr', NULL, 'Ridgecrest', 'CA', '93555', 'US', '+17602646947', true, true
FROM auth.users
WHERE email IN ('admin@unenter.live', 'skillet1005@gmail.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_address_book (user_id, nickname, full_name, company, line1, line2, city, state, postal_code, country, phone, is_default_shipping, is_default_billing)
SELECT id, 'Secondary Storage Annex', 'Tyler Burns', 'Unenter Bio Logistics', '840 S China Lake Blvd', 'Suite B', 'Ridgecrest', 'CA', '93555', 'US', '+17602646947', false, false
FROM auth.users
WHERE email IN ('admin@unenter.live', 'skillet1005@gmail.com')
ON CONFLICT DO NOTHING;
