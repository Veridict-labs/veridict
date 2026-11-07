// Mirrors the API response shapes in apps/api (inquiries, knowledge, feedback).
export type { PersonalDataRequest, ProcessingMode } from '@veridict/contracts';
import type { PersonalDataRequest } from '@veridict/contracts';

export type Role = 'EMPLOYEE' | 'REVIEWER' | 'ADMIN';
export type SourceType = 'DOCUMENT' | 'CHAT' | 'TASK';
export type SourceState =
  | 'APPROVED'
  | 'OFFICIAL_INTERNAL'
  | 'INFORMAL'
  | 'DRAFT'
  | 'SUPERSEDED'
  | 'UNKNOWN';
export type InquiryStatus =
  | 'PENDING'
  | 'ANSWERED'
  | 'NEEDS_CLARIFICATION'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNAVAILABLE'
  | 'NEEDS_REVALIDATION';

export type Me = {
  id: string;
  org_id: string;
  role: Role;
  department: string;
  review_domains: string[];
  name?: string;
};

export type Citation = { source_id: string; chunk_id: string };

export type Evidence = Citation & {
  title: string;
  source_type: SourceType;
  excerpt: string;
  redacted?: boolean;
  span_start: number;
  span_end: number;
  integrity_hash: string;
  source_state: SourceState;
  version: number;
  issuer_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  recorded_at: string;
};

export type Statement = { statement: string; evidence: Citation[] };

export type Escalation = {
  status: string;
  owner: { name: string; contact_email: string } | null;
  evidence?: Citation | null;
} | null;

export type Inquiry = {
  processing_mode?: 'ai' | 'no_ai';
  personal_data_request?: PersonalDataRequest | null;
  inquiry_id: string;
  question: string;
  status: InquiryStatus;
  escalation: Escalation;
  answer: string | null;
  assumptions: string[];
  limitations: string[];
  citations: Evidence[];
  official_truth: Statement | null;
  operational_truth: Statement | null;
  conflicts: (Statement | null)[];
  decision_trail: { label: string; evidence: Citation[] }[];
  created_at: string;
  updated_at: string;
};

export type InquirySummary = {
  inquiry_id: string;
  status: InquiryStatus;
  created_at: string;
  question?: string;
};

export type TraceEvent = {
  event_id: string;
  event_type: string;
  tool_call_id: string | null;
  decision: string | null;
  resource_refs: string[];
  metadata: unknown;
  created_at: string;
};

export type FeedbackAction = 'CONFIRM' | 'DISPUTE' | 'COMMENT' | 'EXCEPTION';

export type PendingFeedback = {
  feedback_id: string;
  inquiry_id: string;
  reason: string;
  action: FeedbackAction;
  created_at: string;
  domain?: string;
  question?: string;
};
