// Synthetic demo data for offline UI exploration. Content mirrors
// apps/api/fixtures/demo.json, but nothing here is a measured agent output.
import type { Evidence, Inquiry, PendingFeedback } from './types';

const src = (n: number) =>
  `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const chk = (n: number) =>
  `00000000-0000-4000-9000-0000000000${String(n).padStart(2, '0')}`;

export const DEMO_EVIDENCE: Record<string, Evidence> = {
  fuel_old: {
    source_id: src(1),
    chunk_id: chk(1),
    title: 'Old fuel SOP',
    source_type: 'DOCUMENT',
    excerpt:
      'Onboarding reimbursement: the monthly fuel allowance is Rp500000.',
    span_start: 0,
    span_end: 66,
    integrity_hash: 'a1f3…9c02',
    source_state: 'SUPERSEDED',
    version: 1,
    issuer_id: null,
    valid_from: '2026-01-01T00:00:00Z',
    valid_until: '2026-02-01T00:00:00Z',
    recorded_at: '2026-01-01T00:00:00Z',
  },
  fuel_new: {
    source_id: src(2),
    chunk_id: chk(2),
    title: 'Authorized HR fuel update',
    source_type: 'CHAT',
    excerpt:
      'Onboarding reimbursement: the monthly fuel allowance is Rp750000. This approved HR notice replaces the old SOP.',
    span_start: 0,
    span_end: 112,
    integrity_hash: '7be0…41d8',
    source_state: 'APPROVED',
    version: 2,
    issuer_id: null,
    valid_from: '2026-02-01T00:00:00Z',
    valid_until: null,
    recorded_at: '2026-02-01T09:12:00Z',
  },
  onboarding_task: {
    source_id: src(3),
    chunk_id: chk(3),
    title: 'Onboarding reimbursement task',
    source_type: 'TASK',
    excerpt:
      'Onboarding reimbursement: submit the receipt using the internal reimbursement form.',
    span_start: 0,
    span_end: 84,
    integrity_hash: '19cc…e7a0',
    source_state: 'UNKNOWN',
    version: 1,
    issuer_id: null,
    valid_from: null,
    valid_until: null,
    recorded_at: '2026-02-03T08:00:00Z',
  },
  procurement: {
    source_id: src(4),
    chunk_id: chk(4),
    title: 'SaaS renewal approval policy',
    source_type: 'DOCUMENT',
    excerpt: 'Director approval is required for SaaS renewals above Rp100M.',
    span_start: 0,
    span_end: 62,
    integrity_hash: '5d42…aa1b',
    source_state: 'APPROVED',
    version: 1,
    issuer_id: null,
    valid_from: '2026-01-01T00:00:00Z',
    valid_until: null,
    recorded_at: '2026-01-01T00:00:00Z',
  },
  ledger: {
    source_id: src(5),
    chunk_id: chk(5),
    title: 'Synthetic renewal ledger',
    source_type: 'DOCUMENT',
    excerpt:
      'Synthetic history: 23 of 26 comparable SaaS renewals were approved by VP; 3 were approved by Director.',
    span_start: 0,
    span_end: 103,
    integrity_hash: 'c08e…3f55',
    source_state: 'UNKNOWN',
    version: 1,
    issuer_id: null,
    valid_from: null,
    valid_until: null,
    recorded_at: '2026-03-10T00:00:00Z',
  },
  directory: {
    source_id: src(6),
    chunk_id: chk(6),
    title: 'Published HR contact directory',
    source_type: 'DOCUMENT',
    excerpt:
      'Demo HR Owner handles fuel and reimbursement questions. Business contact: hr-owner@example.test.',
    span_start: 0,
    span_end: 97,
    integrity_hash: '2e77…b610',
    source_state: 'UNKNOWN',
    version: 1,
    issuer_id: null,
    valid_from: null,
    valid_until: null,
    recorded_at: '2026-01-05T00:00:00Z',
  },
};

const cite = (key: keyof typeof DEMO_EVIDENCE) => ({
  source_id: DEMO_EVIDENCE[key].source_id,
  chunk_id: DEMO_EVIDENCE[key].chunk_id,
});

const DEMO_NOTE = 'Demo data: synthetic fixture, no agent was executed.';

export const DEMO_INQUIRIES: Inquiry[] = [
  {
    inquiry_id: 'demo-fuel',
    question: 'Berapa tunjangan bensin bulanan yang berlaku?',
    status: 'ANSWERED',
    escalation: null,
    answer:
      'Tunjangan bensin bulanan yang berlaku adalah Rp750.000. Pembaruan HR yang disetujui (berlaku sejak 1 Februari 2026) menggantikan SOP lama yang menyebut Rp500.000.',
    assumptions: [
      'You are asking about the onboarding monthly fuel allowance.',
    ],
    limitations: [DEMO_NOTE],
    citations: [DEMO_EVIDENCE.fuel_new, DEMO_EVIDENCE.fuel_old],
    official_truth: {
      statement:
        'Rp750.000 per month under the approved HR update, valid from 1 Feb 2026.',
      evidence: [cite('fuel_new')],
    },
    operational_truth: null,
    conflicts: [
      {
        statement:
          'The old SOP says Rp500.000. It is superseded by the approved HR update, so it no longer applies.',
        evidence: [cite('fuel_old'), cite('fuel_new')],
      },
    ],
    decision_trail: [
      {
        label: 'Found two sources that state a fuel allowance amount.',
        evidence: [cite('fuel_old'), cite('fuel_new')],
      },
      {
        label: 'The HR update is APPROVED and explicitly replaces the SOP.',
        evidence: [cite('fuel_new')],
      },
      {
        label: 'The SOP’s validity ended when the update took effect.',
        evidence: [cite('fuel_old')],
      },
    ],
    created_at: '2026-11-06T09:02:00Z',
    updated_at: '2026-11-06T09:02:17Z',
  },
  {
    inquiry_id: 'demo-saas',
    question:
      'Siapa approver untuk SaaS renewal Rp180 juta, and what happened before?',
    status: 'ANSWERED',
    escalation: null,
    answer:
      'A Rp180M SaaS renewal needs Director approval under the current policy. In past comparable renewals, 23 of 26 were approved by a VP. That is a gap between policy and practice, not a change to the rule; it has been flagged for the policy owner.',
    assumptions: ['The renewal is a single SaaS contract above Rp100M.'],
    limitations: [
      DEMO_NOTE,
      'Past practice is descriptive only and never overrides the formal rule.',
    ],
    citations: [DEMO_EVIDENCE.procurement, DEMO_EVIDENCE.ledger],
    official_truth: {
      statement:
        'Director approval is required for SaaS renewals above Rp100M.',
      evidence: [cite('procurement')],
    },
    operational_truth: {
      statement:
        '23 of 26 comparable past renewals were approved by a VP; 3 by a Director.',
      evidence: [cite('ledger')],
    },
    conflicts: [
      {
        statement:
          'Policy–practice gap: observed approvals mostly by VP, while the approved policy requires Director. Recommend policy-owner review.',
        evidence: [cite('procurement'), cite('ledger')],
      },
    ],
    decision_trail: [
      {
        label:
          'Matched the approved procurement policy for amounts above Rp100M.',
        evidence: [cite('procurement')],
      },
      {
        label: 'Looked up validated comparable precedents.',
        evidence: [cite('ledger')],
      },
      {
        label: 'Kept the official rule; reported practice separately.',
        evidence: [cite('procurement'), cite('ledger')],
      },
    ],
    created_at: '2026-11-06T09:10:00Z',
    updated_at: '2026-11-06T09:10:21Z',
  },
  {
    inquiry_id: 'demo-onboarding',
    question: 'Give me an onboarding reimbursement summary with sources.',
    status: 'ANSWERED',
    escalation: null,
    answer:
      'Your monthly fuel allowance is Rp750,000 (approved HR update). To claim it, submit the receipt using the internal reimbursement form. Questions go to the HR owner for fuel and reimbursement.',
    assumptions: [],
    limitations: [DEMO_NOTE],
    citations: [
      DEMO_EVIDENCE.fuel_new,
      DEMO_EVIDENCE.onboarding_task,
      DEMO_EVIDENCE.directory,
    ],
    official_truth: {
      statement: 'Rp750,000 monthly fuel allowance.',
      evidence: [cite('fuel_new')],
    },
    operational_truth: null,
    conflicts: [],
    decision_trail: [
      {
        label:
          'Combined a chat update, a task record and a directory document.',
        evidence: [
          cite('fuel_new'),
          cite('onboarding_task'),
          cite('directory'),
        ],
      },
    ],
    created_at: '2026-11-06T09:20:00Z',
    updated_at: '2026-11-06T09:20:14Z',
  },
  {
    inquiry_id: 'demo-missing',
    question: 'What is the quantum-travel allowance?',
    status: 'INSUFFICIENT_EVIDENCE',
    escalation: {
      status: 'AVAILABLE',
      owner: { name: 'Demo HR Owner', contact_email: 'hr-owner@example.test' },
      evidence: cite('directory'),
    },
    answer:
      'I don’t have enough evidence to answer this. No source you can access describes a quantum-travel allowance.',
    assumptions: [],
    limitations: [DEMO_NOTE],
    citations: [],
    official_truth: null,
    operational_truth: null,
    conflicts: [],
    decision_trail: [],
    created_at: '2026-11-06T09:30:00Z',
    updated_at: '2026-11-06T09:30:09Z',
  },
  {
    inquiry_id: 'demo-kenari',
    question: 'Apa perkembangan proyek Kenari?',
    status: 'UNAVAILABLE',
    escalation: null,
    answer: 'Informasi tidak tersedia untuk menjawab pertanyaan ini.',
    assumptions: [],
    limitations: [DEMO_NOTE],
    citations: [],
    official_truth: null,
    operational_truth: null,
    conflicts: [],
    decision_trail: [],
    created_at: '2026-11-06T09:40:00Z',
    updated_at: '2026-11-06T09:40:05Z',
  },
  {
    inquiry_id: 'demo-stale',
    question: 'How much was the fuel allowance last January?',
    status: 'NEEDS_REVALIDATION',
    escalation: null,
    answer: null,
    assumptions: [],
    limitations: ['Evidence has changed; the answer needs revalidation.'],
    citations: [],
    official_truth: null,
    operational_truth: null,
    conflicts: [],
    decision_trail: [],
    created_at: '2026-01-20T10:00:00Z',
    updated_at: '2026-01-20T10:00:12Z',
  },
];

export const DEMO_FEEDBACK: PendingFeedback[] = [
  {
    feedback_id: 'demo-fb-1',
    inquiry_id: 'demo-saas',
    domain: 'procurement',
    action: 'EXCEPTION',
    reason:
      'The CFO granted a one-time exception letting a VP approve the Q3 analytics renewal. Please record it as a precedent.',
    created_at: '2026-11-06T10:05:00Z',
    question:
      'Siapa approver untuk SaaS renewal Rp180 juta, and what happened before?',
  },
  {
    feedback_id: 'demo-fb-2',
    inquiry_id: 'demo-fuel',
    domain: 'fuel',
    action: 'CONFIRM',
    reason: 'Confirmed with payroll: February payslips used Rp750.000.',
    created_at: '2026-11-06T11:40:00Z',
    question: 'Berapa tunjangan bensin bulanan yang berlaku?',
  },
];

export const SUGGESTED_QUESTIONS = [
  'Berapa tunjangan bensin bulanan yang berlaku?',
  'Siapa approver untuk SaaS renewal Rp180 juta?',
  'Give me an onboarding reimbursement summary with sources.',
  'Bagaimana cara klaim reimbursement?',
];
