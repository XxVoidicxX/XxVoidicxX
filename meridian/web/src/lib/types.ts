export type Role = "admin" | "risk_analyst" | "procurement" | "vendor_owner" | "auditor";
export interface User { id: number; name: string; email: string; role: Role; department: string | null; title: string | null; active: number; created_at?: string }

export type VendorStatus = "prospect" | "onboarding" | "active" | "under_review" | "offboarding" | "terminated";
export type Tier = "critical" | "high" | "medium" | "low";
export type DataAccess = "none" | "internal" | "confidential" | "restricted";
export interface Vendor {
  id: number; name: string; legal_name: string | null; category: string; website: string | null; country: string | null;
  status: VendorStatus; tier: Tier; inherent_risk: number; residual_risk: number; data_access: DataAccess; annual_spend: number;
  owner_id: number | null; owner_name: string | null; description: string | null; services: string | null; next_review_date: string | null;
  onboarded_at: string | null; created_at: string; updated_at: string;
  active_contracts: number; open_findings: number; document_alerts: number; last_assessed_at: string | null;
}
export interface VendorContact { id: number; vendor_id: number; name: string; email: string | null; phone: string | null; role: string | null; is_primary: number }
export interface VendorDetail extends Vendor {
  contacts: VendorContact[]; contracts: Contract[]; assessments: Assessment[]; documents: Document[]; findings: Finding[]; approvals: Approval[]; activity: Activity[];
}

export type ContractType = "msa" | "sow" | "nda" | "dpa" | "saas" | "license" | "services";
export type ContractStatus = "draft" | "in_review" | "active" | "expiring" | "expired" | "terminated";
export interface Contract {
  id: number; vendor_id: number; vendor_name?: string; vendor_tier?: Tier; title: string; contract_number: string; type: ContractType; status: ContractStatus;
  value: number; currency: string; start_date: string | null; end_date: string | null; auto_renew: number; renewal_notice_days: number;
  owner_id: number | null; owner_name?: string | null; notes: string | null; created_at: string; updated_at: string; days_to_end?: number | null; pending_obligations?: number;
}
export interface Obligation { id: number; contract_id: number; description: string; due_date: string | null; status: "pending" | "met" | "missed" | "waived"; owner_id: number | null; owner_name?: string | null }
export interface ContractDetail extends Contract { obligations: Obligation[]; documents: Document[]; approvals: Approval[]; activity: Activity[] }

export type AssessmentStatus = "not_started" | "in_progress" | "submitted" | "under_review" | "completed";
export type Answer = "yes" | "partial" | "no" | "na";
export interface AssessmentTemplate { id: number; name: string; description: string | null; framework: string | null; version: string; active: number; question_count?: number; usage_count?: number; questions?: TemplateQuestion[] }
export interface TemplateQuestion { id: number; template_id: number; section: string; text: string; guidance: string | null; weight: number; sort_order: number; answer?: Answer | null; note?: string | null; answer_id?: number | null }
export interface Assessment {
  id: number; vendor_id: number; vendor_name?: string; vendor_tier?: Tier; template_id: number; template_name?: string; framework?: string | null; title: string; status: AssessmentStatus;
  assigned_to: number | null; assignee_name?: string | null; reviewer_id: number | null; reviewer_name?: string | null; due_date: string | null; score: number | null; risk_rating: Tier | null; summary: string | null;
  created_at: string; submitted_at: string | null; completed_at: string | null; question_count?: number; answered_count?: number; days_to_due?: number | null;
}
export interface AssessmentDetail extends Assessment { questions: TemplateQuestion[]; findings: Finding[]; comments: Comment[]; activity: Activity[] }

export type DocumentType = "soc2" | "iso27001" | "insurance" | "pen_test" | "dpa" | "financial" | "policy" | "other";
export type DocumentStatus = "valid" | "expiring" | "expired" | "pending_review" | "rejected";
export interface Document {
  id: number; vendor_id: number; vendor_name?: string; vendor_tier?: Tier; contract_id: number | null; contract_title?: string | null; name: string; type: DocumentType; status: DocumentStatus;
  issued_date: string | null; expiry_date: string | null; file_name: string | null; file_size: number; uploaded_by: number | null; uploaded_by_name?: string | null; notes: string | null; created_at: string; days_to_expiry?: number | null;
}

export type Severity = Tier;
export type FindingStatus = "open" | "in_remediation" | "risk_accepted" | "closed";
export interface Finding {
  id: number; vendor_id: number; vendor_name?: string; vendor_tier?: Tier; assessment_id: number | null; assessment_title?: string | null; title: string; description: string | null;
  severity: Severity; status: FindingStatus; owner_id: number | null; owner_name?: string | null; due_date: string | null; remediation_plan: string | null; created_at: string; resolved_at: string | null; days_to_due?: number | null;
}
export interface FindingDetail extends Finding { comments: Comment[]; activity: Activity[]; approvals: Approval[] }

export type ApprovalType = "vendor_onboarding" | "contract" | "risk_acceptance" | "offboarding" | "document";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export interface Approval {
  id: number; type: ApprovalType; entity_type: string; entity_id: number; title: string; description: string | null; requested_by: number; requested_by_name?: string;
  approver_id: number | null; approver_name?: string | null; status: ApprovalStatus; comment: string | null; priority: "low" | "normal" | "high" | "urgent"; created_at: string; decided_at: string | null; vendor_name?: string | null;
}
export interface ApprovalDetail extends Approval { comments: Comment[]; can_decide: boolean; entity?: Record<string, unknown> }

export interface Comment { id: number; entity_type: string; entity_id: number; author_id: number; author_name: string; author_role?: Role; body: string; created_at: string }
export interface Activity { id: number; actor_id: number | null; actor_name: string | null; actor_role?: Role; action: string; entity_type: string; entity_id: number | null; summary: string; metadata: string | null; created_at: string }
export interface Notification { id: number; user_id: number; title: string; body: string | null; link: string | null; read: number; created_at: string }

export interface Paged<T> { data: T[]; total: number; page: number; limit: number }
