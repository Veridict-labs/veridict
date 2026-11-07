import { createHash } from 'node:crypto';
import { z } from 'zod';
import { answerInput, citationSchema, resolveInput, type ResolveInput } from '@veridict/contracts';
import { AgentError } from './model';

export const policyResolution = z.object({
  status: z.enum(['SUPPORTED', 'INSUFFICIENT_EVIDENCE', 'NEEDS_REVIEW', 'NEEDS_CLARIFICATION']),
  applicable: z.array(z.object({
    result: z.string().min(1).max(2000),
    authority: z.string().min(1).max(120),
    evidence: citationSchema.extend({ excerpt: z.string() }).passthrough(),
  })).default([]),
  rejected: z.array(z.object({
    reason: z.string(), result: z.string().optional(),
    evidence: citationSchema.extend({ excerpt: z.string() }).passthrough().optional(),
  })).default([]),
});

export type PolicyCheck = { input: ResolveInput; result: unknown };
export const policyCheckSchema = z.object({ input: resolveInput, result: z.record(z.string(), z.unknown()) });

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]),
  );
  return value;
}

/** Ignore only the resolver's observation clock, not policy validity or source metadata. */
export function policyFingerprint(result: unknown): string {
  const { as_of: ignoredClock, ...facts } = result as Record<string, unknown>;
  void ignoredClock;
  return createHash('sha256').update(JSON.stringify(canonical(facts))).digest('hex');
}

export function policyScope(input: ResolveInput): string {
  return JSON.stringify(canonical(input));
}

export function canonicalConflictAnswer(checks: PolicyCheck[], question: string) {
  const claims = checks.map((c) => policyResolution.parse(c.result))
    .filter((p) => p.status === 'NEEDS_REVIEW').flatMap((p) => p.applicable);
  if (new Set(claims.map((c) => JSON.stringify([c.result, c.authority]))).size < 2 || claims.length > 30) return null;
  const indonesian = /\b(apa|berapa|bagaimana|siapa|bisa|boleh|saya|tunjangan|bensin)\b/i.test(question);
  const conflicts = claims.map((c) => ({ statement: `${c.result} (${c.authority})`, evidence: [{ source_id: c.evidence.source_id, chunk_id: c.evidence.chunk_id }] }));
  const citations = [...new Map(conflicts.flatMap((c) => c.evidence).map((c) => [`${c.source_id}:${c.chunk_id}`, c])).values()];
  return answerInput.parse({ status: 'INSUFFICIENT_EVIDENCE',
    answer: `${indonesian ? 'Aturan resmi yang berlaku saling bertentangan; perlu peninjauan pemilik bidang.' : 'Applicable formal policies conflict; the subject-matter owner must review them.'}\n${conflicts.map((c) => c.statement).join('\n')}`,
    citations, conflicts,
  });
}

/** Render only backend policy facts; a model draft or verifier cannot replace the formal result. */
export function canonicalPolicyAnswer(checks: PolicyCheck[], question: string, reconciliation?: unknown) {
  const policies = checks.map((c) => policyResolution.parse(c.result));
  const applicable = policies.flatMap((p) => p.applicable);
  const officialRefs = [...new Map(applicable.map((p) => [
    `${p.evidence.source_id}:${p.evidence.chunk_id}`,
    { source_id: p.evidence.source_id, chunk_id: p.evidence.chunk_id },
  ])).values()];
  const statement = [...new Set(applicable.map((p) => `${p.result} (${p.authority})`))].sort().join('; ');
  const indonesian = /\b(apa|berapa|bagaimana|siapa|bisa|boleh|saya|tunjangan|bensin)\b/i.test(question);
  const exclusions = policies.flatMap((p) => p.rejected).filter((p) =>
    p.evidence && p.result && ['EXPLICITLY_SUPERSEDED', 'OUTSIDE_VALIDITY_WINDOW'].includes(p.reason),
  );
  const conflicts = exclusions.map((p) => ({
    statement: `${p.result}: ${p.reason === 'EXPLICITLY_SUPERSEDED'
      ? indonesian ? 'digantikan secara eksplisit' : 'explicitly superseded'
      : indonesian ? 'di luar masa berlaku yang dipilih' : 'outside the selected validity window'}.`,
    evidence: [{ source_id: p.evidence!.source_id, chunk_id: p.evidence!.chunk_id }],
  }));
  let operational: { statement: string; evidence: z.infer<typeof citationSchema>[] } | null = null;
  const practice = z.object({ operational_truth: z.object({
    results: z.array(z.object({ case_id: z.uuid(), authority: z.string(), comparable: z.boolean(), evidence: z.array(citationSchema.passthrough()).min(1) })).max(30),
  }) }).safeParse(reconciliation);
  if (practice.success) {
    const cases = [...new Map(practice.data.operational_truth.results.filter((c) => c.comparable).map((c) => [c.case_id, c])).values()];
    const refs = [...new Map(cases.flatMap((c) => c.evidence).map((p) => [`${p.source_id}:${p.chunk_id}`, { source_id: p.source_id, chunk_id: p.chunk_id }])).values()];
    if (cases.length && refs.length <= 30) {
      const counts = new Map<string, number>();
      for (const c of cases) counts.set(c.authority, (counts.get(c.authority) ?? 0) + 1);
      const pattern = [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([authority, count]) => `${authority}: ${count}`).join('; ');
      operational = {
        statement: `${indonesian ? 'Praktik historis nonmengikat dalam sampel yang dikembalikan' : 'Nonbinding historical practice in the returned sample'} (${cases.length}): ${pattern}.`,
        evidence: refs,
      };
      const formal = policyResolution.safeParse((reconciliation as Record<string, unknown>)?.official_truth);
      if (formal.success && cases.some((c) => !formal.data.applicable.some((p) => p.authority === c.authority))) {
        const evidence = [...new Map([...officialRefs, ...refs].map((p) => [`${p.source_id}:${p.chunk_id}`, p])).values()];
        if (evidence.length <= 30) conflicts.push({
          statement: indonesian ? 'Praktik historis berbeda dari aturan resmi; tidak mengubah kewenangan formal.'
            : 'Historical practice differs from formal policy and does not change its authority.',
          evidence,
        });
      }
    }
  }
  const citations = [...new Map([...officialRefs, ...conflicts.flatMap((p) => p.evidence), ...(operational?.evidence ?? [])].map((p) => [`${p.source_id}:${p.chunk_id}`, p])).values()];
  if (statement.length > 4000 || conflicts.length > 30 || officialRefs.length > 30 || citations.length > 100)
    throw new AgentError('AI_BUDGET_EXCEEDED');
  return answerInput.parse({
    status: 'ANSWERED',
    answer: `${indonesian ? 'Aturan resmi' : 'Official policy'}: ${statement}.${conflicts.length ? `\n${conflicts.map((p) => p.statement).join('\n')}` : ''}${operational ? `\n${operational.statement}` : ''}`,
    citations,
    official_truth: { statement, evidence: officialRefs },
    operational_truth: operational,
    conflicts,
    limitations: [indonesian
      ? 'Praktik historis tidak mengubah kewenangan aturan resmi.'
      : 'Historical practice does not change formal policy authority.'],
  });
}
