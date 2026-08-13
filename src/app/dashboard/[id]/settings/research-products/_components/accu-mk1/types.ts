export type PeptideRequestStatus =
  | "new"
  | "approved"
  | "ordering_standard"
  | "sample_prep_created"
  | "in_process"
  | "completed"
  | "on_hold"
  | "rejected"
  | "cancelled";

export interface PeptideRequestStatusLog {
  id: string;
  request_id: string;
  old_status: PeptideRequestStatus | null;
  new_status: PeptideRequestStatus;
  changed_by: string | null;
  source: string;
  notes: string | null;
  created_at: string;
}

export interface PeptideRequest {
  id: string;
  compound_name: string;
  cas_number?: string | null;
  molecular_formula?: string | null;
  molecular_weight?: number | null;
  purity_requirement?: string | null;
  quantity_requested?: string | null;
  intended_use?: string | null;
  notes?: string | null;
  requester_name: string;
  requester_email: string;
  requester_company?: string | null;
  status: PeptideRequestStatus;
  previous_status?: PeptideRequestStatus | null;
  clickup_task_id?: string | null;
  clickup_task_url?: string | null;
  senaite_analysis_service_id?: string | null;
  woocommerce_coupon_code?: string | null;
  created_at: string;
  updated_at: string;
  history?: PeptideRequestStatusLog[];
}

export interface ClickUpUserMapping {
  id: string;
  clickup_user_id: string;
  clickup_username?: string | null;
  clickup_email?: string | null;
  system_user_id?: string | null;
  system_user_email?: string | null;
  created_at: string;
  updated_at: string;
}
