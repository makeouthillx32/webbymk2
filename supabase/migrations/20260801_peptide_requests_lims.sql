-- 20260801_peptide_requests_lims.sql
-- Fresh LIMS Peptide Requests schema for webbymk2

CREATE TABLE IF NOT EXISTS peptide_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compound_name TEXT NOT NULL,
    cas_number TEXT,
    molecular_formula TEXT,
    molecular_weight NUMERIC,
    purity_requirement TEXT,
    quantity_requested TEXT,
    intended_use TEXT,
    notes TEXT,
    requester_name TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    requester_company TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    previous_status TEXT,
    clickup_task_id TEXT,
    clickup_task_url TEXT,
    senaite_analysis_service_id TEXT,
    woocommerce_coupon_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS peptide_request_status_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES peptide_requests(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by TEXT,
    source TEXT NOT NULL DEFAULT 'system',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clickup_user_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clickup_user_id TEXT NOT NULL UNIQUE,
    clickup_username TEXT,
    clickup_email TEXT,
    system_user_id TEXT,
    system_user_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- These tables contain requester PII and internal integration metadata.
-- Browser roles have no direct access; public submission and all privileged
-- reads/writes are mediated by scoped server routes.
ALTER TABLE public.peptide_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peptide_request_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clickup_user_mapping ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.peptide_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.peptide_request_status_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.clickup_user_mapping FROM anon, authenticated;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_peptide_requests_status ON peptide_requests(status);
CREATE INDEX IF NOT EXISTS idx_peptide_requests_email ON peptide_requests(requester_email);
CREATE INDEX IF NOT EXISTS idx_peptide_requests_clickup ON peptide_requests(clickup_task_id);
CREATE INDEX IF NOT EXISTS idx_status_log_request_id ON peptide_request_status_log(request_id);
