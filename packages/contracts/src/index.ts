import { z } from 'zod';

export const id = z.uuid();
export const role = z.enum(['EMPLOYEE', 'REVIEWER', 'ADMIN']);
export const sourceType = z.enum(['DOCUMENT', 'CHAT', 'TASK']);
export const sourceState = z.enum([
  'APPROVED',
  'OFFICIAL_INTERNAL',
  'INFORMAL',
  'DRAFT',
  'SUPERSEDED',
  'UNKNOWN',
]);
export const inquiryStatus = z.enum([
  'PENDING',
  'ANSWERED',
  'NEEDS_CLARIFICATION',
  'INSUFFICIENT_EVIDENCE',
  'UNAVAILABLE',
  'NEEDS_REVALIDATION',
]);
export const permission = z.strictObject({
  subject_type: z.enum(['USER', 'DEPARTMENT', 'ORGANIZATION']),
  subject_id: z.string().min(1).max(100),
  action: z.enum(['READ', 'REVIEW']).default('READ'),
});
export const embedding = z
  .array(z.number().finite())
  .min(1)
  .max(4096)
  .refine((v) => v.some((n) => n !== 0), 'Embedding must be nonzero');
const text = z.string().trim().min(1);
export const loginInput = z.strictObject({
  org_slug: text.max(80),
  email: z.email().max(254),
  password: z.string().min(1).max(256),
});
export const userInput = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(12).max(256),
  name: text.max(120),
  role: role.default('EMPLOYEE'),
  department: text.max(80),
  review_domains: z.array(text.max(80)).max(20).default([]),
});
export const userUpdate = z
  .strictObject({
    active: z.boolean().optional(),
    role: role.optional(),
    department: text.max(80).optional(),
    review_domains: z.array(text.max(80)).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one change is required');
export const ingestInput = z
  .strictObject({
    type: sourceType,
    title: text.max(250),
    external_id: text.max(250).optional(),
    state: sourceState.default('UNKNOWN'),
    issuer_id: id.optional(),
    valid_from: z.iso.datetime().optional(),
    valid_until: z.iso.datetime().optional(),
    version: z.number().int().positive().default(1),
    supersedes_id: id.optional(),
    permissions: z.array(permission).max(100).default([]),
    content: text.max(500000).optional(),
    records: z
      .array(
        z.strictObject({
          text: text.max(20000),
          author: text.max(120).optional(),
          timestamp: z.iso.datetime().optional(),
          reference: text.max(250).optional(),
        }),
      )
      .min(1)
      .max(500)
      .optional(),
    embedding_model: text.max(120).optional(),
    embeddings: z.array(embedding).max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.content) === Boolean(v.records))
      ctx.addIssue({
        code: 'custom',
        message: 'Provide content or records, not both',
      });
    if (v.type === 'DOCUMENT' && !v.content)
      ctx.addIssue({ code: 'custom', message: 'Documents require content' });
    if (v.type !== 'DOCUMENT' && !v.records)
      ctx.addIssue({
        code: 'custom',
        message: 'Chat and task exports require records',
      });
    if (v.valid_from && v.valid_until && v.valid_from >= v.valid_until)
      ctx.addIssue({ code: 'custom', message: 'Invalid validity window' });
    if (Boolean(v.embeddings) !== Boolean(v.embedding_model))
      ctx.addIssue({
        code: 'custom',
        message: 'Provide embeddings with their model identifier',
      });
  });
export const searchInput = z
  .strictObject({
    query: text.max(2000),
    source_types: z.array(sourceType).min(1).max(3).optional(),
    limit: z.number().int().min(1).max(30).default(10),
    embedding: embedding.optional(),
    embedding_model: text.max(120).optional(),
  })
  .refine(
    (v) => Boolean(v.embedding) === Boolean(v.embedding_model),
    'Embedding and model must be supplied together',
  );
export const evidenceInput = z.strictObject({ source_id: id, chunk_id: id });
export const policyInput = z
  .strictObject({
    evidence_chunk_id: id,
    domain: text.max(80),
    predicate: z.record(
      z.string(),
      z.union([z.string().max(200), z.number().finite(), z.boolean()]),
    ),
    result: text.max(2000),
    authority: text.max(120),
    valid_from: z.iso.datetime(),
    valid_until: z.iso.datetime().optional(),
    supersedes_id: id.optional(),
  })
  .refine(
    (v) => !v.valid_until || v.valid_from < v.valid_until,
    'Invalid validity window',
  );
export const contextSchema = z.record(
  z.string().max(80),
  z.union([z.string().max(200), z.number().finite(), z.boolean()]),
);
export const resolveInput = z.strictObject({
  domain: text.max(80),
  context: contextSchema.default({}),
  as_of: z.iso.datetime().optional(),
});
export const precedentInput = z.strictObject({
  domain: text.max(80),
  context: contextSchema.default({}),
  max_results: z.number().int().min(1).max(30).default(10),
});
export const caseInput = z.strictObject({
  domain: text.max(80),
  context: contextSchema,
  outcome: text.max(2000),
  authority: text.max(120),
  evidence_chunk_ids: z.array(id).min(1).max(30),
});
export const reconcileInput = resolveInput.extend({
  max_results: z.number().int().min(1).max(30).default(10),
});
export const inquiryInput = z.strictObject({ question: text.max(4000) });
export const citationSchema = z.strictObject({ source_id: id, chunk_id: id });
export const supportedStatement = z.strictObject({
  statement: text.max(4000),
  evidence: z.array(citationSchema).min(1).max(30),
});
export const answerInput = z
  .strictObject({
    status: z.enum([
      'ANSWERED',
      'NEEDS_CLARIFICATION',
      'INSUFFICIENT_EVIDENCE',
      'UNAVAILABLE',
    ]),
    answer: text.max(20000),
    citations: z.array(citationSchema).max(100),
    assumptions: z.array(text.max(500)).max(30).default([]),
    limitations: z.array(text.max(500)).max(30).default([]),
    official_truth: supportedStatement.nullable().default(null),
    operational_truth: supportedStatement.nullable().default(null),
    conflicts: z.array(supportedStatement).max(30).default([]),
    decision_trail: z
      .array(
        z.strictObject({
          label: text.max(500),
          evidence: z.array(citationSchema).min(1).max(30),
        }),
      )
      .max(30)
      .default([]),
  })
  .refine(
    (v) => v.status !== 'ANSWERED' || v.citations.length > 0,
    'Answered inquiries require evidence',
  );
export const feedbackInput = z.strictObject({
  inquiry_id: id,
  domain: text.max(80),
  action: z.enum(['CONFIRM', 'DISPUTE', 'COMMENT', 'EXCEPTION']),
  reason: text.max(4000),
  proposed_case: caseInput.optional(),
});
export const feedbackReview = z.strictObject({
  decision: z.enum(['VALIDATED', 'REJECTED']),
  reason: text.max(2000),
});
export const pageInput = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: id.optional(),
});

export type IngestInput = z.infer<typeof ingestInput>;
export type SearchInput = z.infer<typeof searchInput>;
export type ResolveInput = z.infer<typeof resolveInput>;
export type PrecedentInput = z.infer<typeof precedentInput>;
export type CaseInput = z.infer<typeof caseInput>;
export type ReconcileInput = z.infer<typeof reconcileInput>;
export type AnswerInput = z.infer<typeof answerInput>;
export type FeedbackInput = z.infer<typeof feedbackInput>;
export type PermissionInput = z.infer<typeof permission>;
export type Evidence = {
  source_id: string;
  chunk_id: string;
  title: string;
  source_type: z.infer<typeof sourceType>;
  excerpt: string;
  span_start: number;
  span_end: number;
  integrity_hash: string;
  source_state: z.infer<typeof sourceState>;
  version: number;
  issuer_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  recorded_at: string;
};
