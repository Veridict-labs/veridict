import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CaseInput,
  PrecedentInput,
  ReconcileInput,
  ResolveInput,
} from '@veridict/contracts';
import { policyInput } from '@veridict/contracts';
import { policyCheckSchema, policyFingerprint, policyResolution, type PolicyCheck } from '@veridict/agent';
import { z } from 'zod';
import type { Actor } from '../auth/actor';
import { SecurityService } from '../auth/security.service';
import { AuditService } from '../audit/audit.service';
import { Clock } from '../common/clock';
import type { Prisma } from '../generated/prisma/client';
import {
  evidence,
  maskUsingChunks,
  maskJsonUsingChunks,
} from '../knowledge/content';

type Context = Record<string, string | number | boolean>;
export function evaluateContext(predicate: Context, context: Context) {
  const missing = new Set<string>();
  const matches = Object.entries(predicate).every(([key, value]) => {
    const range = key.endsWith('_min') || key.endsWith('_max');
    const field = range ? key.slice(0, -4) : key;
    if (!Object.hasOwn(context, field)) { missing.add(field); return true; }
    const actual = context[field];
    if (typeof actual !== (range ? 'number' : typeof value)) { missing.add(field); return true; }
    return range
      ? typeof actual === 'number' && typeof value === 'number' &&
        (key.endsWith('_min') ? actual >= value : actual <= value)
      : actual === value;
  });
  return { matches, missing: matches ? [...missing].sort() : [] };
}
export function matches(predicate: Context, context: Context) {
  return Object.entries(predicate).every(([key, value]) => {
    if (key.endsWith('_min') || key.endsWith('_max')) {
      const actual = context[key.slice(0, -4)];
      return (
        typeof actual === 'number' &&
        typeof value === 'number' &&
        (key.endsWith('_min') ? actual >= value : actual <= value)
      );
    }
    return context[key] === value;
  });
}

@Injectable()
export class PolicyService {
  constructor(
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async snapshotsMatchIn(tx: Prisma.TransactionClient, actor: Actor, checks: PolicyCheck[]) {
    if (checks.length > 12) return false;
    for (const check of checks) {
      const parsed = policyCheckSchema.safeParse(check);
      if (!parsed.success || !policyResolution.safeParse(parsed.data.result).success) return false;
      const current = await this.resolveIn(tx, actor, parsed.data.input);
      if (policyFingerprint(current) !== policyFingerprint(parsed.data.result)) return false;
    }
    return true;
  }

  create(actor: Actor, input: z.infer<typeof policyInput>) {
    return this.security.scope(actor, true, async (tx) => {
      this.security.requireReviewer(actor, input.domain);
      const [chunk] = await this.security.chunks(tx, actor, [
        input.evidence_chunk_id,
      ]);
      await this.security.source(tx, actor, chunk.sourceId, 'REVIEW');
      const source = chunk.source;
      const issuer = source.issuerId
        ? await tx.user.findFirst({
            where: { id: source.issuerId, orgId: actor.orgId, active: true },
          })
        : null;
      if (
        source.state !== 'APPROVED' ||
        !issuer ||
        (issuer.role !== 'ADMIN' &&
          (issuer.role !== 'REVIEWER' ||
            !issuer.reviewDomains.includes(input.domain)))
      )
        throw new BadRequestException(
          'A policy requires an approved source with a domain-authorized issuer',
        );
      if (!chunk.content.toLowerCase().includes(input.result.toLowerCase()))
        throw new BadRequestException(
          'Policy result must quote the supporting evidence',
        );
      if (input.supersedes_id) {
        const previous = await tx.policyClaim.findFirst({
          where: {
            id: input.supersedes_id,
            domain: input.domain,
            evidence: { source: this.security.sourceWhere(actor, 'REVIEW') },
          },
        });
        if (!previous) throw new NotFoundException();
        if (previous.evidenceChunkId !== chunk.id) {
          const oldEvidence = await tx.sourceChunk.findUniqueOrThrow({
            where: { id: previous.evidenceChunkId },
            select: { sourceId: true },
          });
          if (
            oldEvidence.sourceId !== source.id &&
            source.supersedesId !== oldEvidence.sourceId
          )
            throw new BadRequestException(
              'Claim supersession must follow the source version chain',
            );
        }
        if (new Date(input.valid_from) < previous.validFrom)
          throw new BadRequestException(
            'Claim versions must have increasing effective dates',
          );
      }
      const claim = await tx.policyClaim.create({
        data: {
          evidenceChunkId: input.evidence_chunk_id,
          domain: input.domain,
          predicate: input.predicate,
          result: input.result,
          authority: input.authority,
          validFrom: input.valid_from,
          validUntil: input.valid_until,
          supersedesId: input.supersedes_id,
          validatedBy: actor.id,
        },
      });
      await this.audit.record(tx, actor, 'POLICY_VALIDATED', [
        claim.id,
        chunk.sourceId,
      ]);
      return { claim_id: claim.id };
    });
  }

  private async resolveIn(
    tx: Prisma.TransactionClient,
    actor: Actor,
    input: ResolveInput,
  ) {
    const asOf = input.as_of ? new Date(input.as_of) : this.clock.now();
    const claims = await tx.policyClaim.findMany({
      where: {
        domain: input.domain,
        evidence: { source: this.security.sourceWhere(actor) },
      },
      include: {
        evidence: {
          include: {
            source: {
              include: {
                issuer: true,
                supersededBy: { select: { state: true, validFrom: true } },
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 501,
    });
    if (claims.length > 500)
      return {
        status: 'NEEDS_REVIEW' as const,
        applicable: [],
        rejected: [],
        as_of: asOf.toISOString(),
        reason: 'TOO_MANY_CANDIDATES',
      };
    const rejected: { claim_id: string; reason: string }[] = [];
    const eligible = claims.filter((c) => {
      const s = c.evidence.source;
      const issuer = s.issuer;
      let reason: string | undefined;
      if (s.state !== 'APPROVED') reason = 'SOURCE_NOT_APPROVED';
      else if (
        !issuer?.active ||
        (issuer.role !== 'ADMIN' &&
          (issuer.role !== 'REVIEWER' ||
            !issuer.reviewDomains.includes(input.domain)))
      )
        reason = 'ISSUER_AUTHORITY_UNVERIFIED';
      else if (
        c.validFrom > asOf ||
        (c.validUntil && c.validUntil <= asOf) ||
        (s.validFrom && s.validFrom > asOf) ||
        (s.validUntil && s.validUntil <= asOf)
      )
        reason = 'OUTSIDE_VALIDITY_WINDOW';
      else if (!evaluateContext(c.predicate as Context, input.context).matches)
        reason = 'CONTEXT_NOT_MATCHED';
      if (reason) rejected.push({ claim_id: c.id, reason });
      return !reason;
    });
    const supersededClaims = new Set(
      eligible.flatMap((c) => (c.supersedesId ? [c.supersedesId] : [])),
    );
    const supersededSources = new Set(
      eligible.flatMap((c) =>
        c.evidence.source.supersedesId ? [c.evidence.source.supersedesId] : [],
      ),
    );
    // Follow full version chains, including versions without their own visible claim.
    for (const claim of eligible) {
      let current = claim.supersedesId;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        seen.add(current);
        supersededClaims.add(current);
        current = claims.find((c) => c.id === current)?.supersedesId ?? null;
      }
      let sourceId = claim.evidence.source.supersedesId;
      const sourcesSeen = new Set<string>();
      while (sourceId && !sourcesSeen.has(sourceId)) {
        sourcesSeen.add(sourceId);
        supersededSources.add(sourceId);
        const predecessor = await tx.knowledgeSource.findFirst({
          where: { id: sourceId, ...this.security.sourceWhere(actor) },
          select: { supersedesId: true },
        });
        sourceId = predecessor?.supersedesId ?? null;
      }
    }
    const applicableClaims = eligible.filter((c) => {
      if (
        supersededClaims.has(c.id) ||
        supersededSources.has(c.evidence.sourceId)
      ) {
        rejected.push({ claim_id: c.id, reason: 'EXPLICITLY_SUPERSEDED' });
        return false;
      }
      const replacement = c.evidence.source.supersededBy;
      if (
        replacement?.state === 'APPROVED' &&
        replacement.validFrom &&
        replacement.validFrom <= asOf
      ) {
        // Do not return obsolete policy when its replacement is inaccessible.
        rejected.push({ claim_id: c.id, reason: 'OUTSIDE_VALIDITY_WINDOW' });
        return false;
      }
      return true;
    });
    const requiredContext = [...new Set(applicableClaims.flatMap((c) =>
      evaluateContext(c.predicate as Context, input.context).missing,
    ))].sort();
    const completeClaims = applicableClaims.filter((c) =>
      !evaluateContext(c.predicate as Context, input.context).missing.length,
    );
    const applicable = completeClaims.map((c) => ({
      claim_id: c.id,
      result: maskUsingChunks(c.result, [c.evidence]),
      authority: maskUsingChunks(c.authority, [c.evidence]),
      predicate: maskJsonUsingChunks(c.predicate, [c.evidence]),
      valid_from: c.validFrom.toISOString(),
      valid_until: c.validUntil?.toISOString() ?? null,
      evidence: evidence(c.evidence),
    }));
    const distinct = new Set(
      completeClaims.map((c) => JSON.stringify([c.result, c.authority])),
    );
    const status =
      requiredContext.length
        ? ('NEEDS_CLARIFICATION' as const)
        : applicable.length === 0
        ? ('INSUFFICIENT_EVIDENCE' as const)
        : distinct.size > 1
          ? ('NEEDS_REVIEW' as const)
          : ('SUPPORTED' as const);
    return {
      status,
      required_context: requiredContext.map((field) => maskUsingChunks(field, applicableClaims.map((c) => c.evidence))),
      applicable,
      rejected: rejected.map((entry) => {
        const claim = claims.find((c) => c.id === entry.claim_id)!;
        return { ...entry, result: maskUsingChunks(claim.result, [claim.evidence]),
          valid_from: claim.validFrom.toISOString(), valid_until: claim.validUntil?.toISOString() ?? null,
          authority: maskUsingChunks(claim.authority, [claim.evidence]), evidence: evidence(claim.evidence) };
      }),
      as_of: asOf.toISOString(),
      reason: status === 'NEEDS_REVIEW' ? 'CONFLICTING_APPROVED_CLAIMS' : null,
    };
  }

  resolve(actor: Actor, input: ResolveInput) {
    return this.security.scope(actor, false, async (tx) => {
      const result = await this.resolveIn(tx, actor, input);
      await this.audit.record(
        tx,
        actor,
        'POLICY_RESOLVED',
        result.applicable.map((c) => c.claim_id),
        result.status,
      );
      return result;
    });
  }

  async validateCaseEvidence(
    tx: Prisma.TransactionClient,
    actor: Actor,
    input: CaseInput,
    review: boolean,
  ) {
    const chunks = await this.security.chunks(
      tx,
      actor,
      input.evidence_chunk_ids,
    );
    if (review)
      for (const sourceId of new Set(chunks.map((c) => c.sourceId)))
        await this.security.source(tx, actor, sourceId, 'REVIEW');
    return chunks;
  }

  createCase(actor: Actor, input: CaseInput) {
    return this.security.scope(actor, true, async (tx) => {
      this.security.requireReviewer(actor, input.domain);
      await this.validateCaseEvidence(tx, actor, input, true);
      const record = await tx.decisionCase.create({
        data: {
          domain: input.domain,
          context: input.context,
          outcome: input.outcome,
          authority: input.authority,
          status: 'VALIDATED',
          reviewedBy: actor.id,
          evidence: {
            create: [...new Set(input.evidence_chunk_ids)].map((chunkId) => ({
              chunkId,
            })),
          },
        },
      });
      await this.audit.record(tx, actor, 'CASE_VALIDATED', [record.id]);
      return { case_id: record.id };
    });
  }

  private async precedentsIn(
    tx: Prisma.TransactionClient,
    actor: Actor,
    input: PrecedentInput,
  ) {
    const where: Prisma.DecisionCaseWhereInput = {
      domain: input.domain,
      status: 'VALIDATED',
      evidence: {
        some: {},
        every: { chunk: { source: this.security.sourceWhere(actor) } },
      },
    };
    const records = await tx.decisionCase.findMany({
      where,
      include: {
        evidence: { include: { chunk: { include: { source: true } } } },
      },
      take: 201,
      orderBy: { createdAt: 'desc' },
    });
    if (records.length > 200)
      return {
        results: [],
        sample_size: 0,
        truncated: true,
        reason: 'NARROW_CONTEXT_REQUIRED',
      };
    const ranked = records
      .map((c) => {
        const context = c.context as Context;
        const factors = Object.keys(input.context).filter(
          (k) => context[k] === input.context[k],
        );
        const differences = Object.keys(input.context).filter(
          (k) => context[k] !== input.context[k],
        );
        return {
          case_id: c.id,
          outcome: maskUsingChunks(
            c.outcome,
            c.evidence.map((e) => e.chunk),
          ),
          authority: maskUsingChunks(
            c.authority,
            c.evidence.map((e) => e.chunk),
          ),
          matching_factors: factors,
          disqualifying_differences: differences,
          comparable: differences.length === 0 && factors.length > 0,
          evidence: c.evidence.map((e) => evidence(e.chunk)),
        };
      })
      .sort(
        (a, b) =>
          Number(b.comparable) - Number(a.comparable) ||
          b.matching_factors.length - a.matching_factors.length ||
          a.case_id.localeCompare(b.case_id),
      );
    const results = ranked.slice(0, input.max_results);
    return {
      results,
      sample_size: results.length,
      truncated: ranked.length > results.length,
      reason: null,
    };
  }
  precedents(actor: Actor, input: PrecedentInput) {
    return this.security.scope(actor, false, async (tx) => {
      const result = await this.precedentsIn(tx, actor, input);
      await this.audit.record(
        tx,
        actor,
        'PRECEDENTS_FOUND',
        result.results.map((c) => c.case_id),
      );
      return result;
    });
  }
  reconcile(actor: Actor, input: ReconcileInput) {
    return this.security.scope(actor, false, async (tx) => {
      const official = await this.resolveIn(tx, actor, input);
      const practice = await this.precedentsIn(tx, actor, input);
      const comparable = practice.results.filter((c) => c.comparable);
      const pattern = Object.entries(
        comparable.reduce<Record<string, number>>((counts, c) => {
          counts[c.authority] = (counts[c.authority] ?? 0) + 1;
          return counts;
        }, {}),
      ).map(([authority, count]) => ({ authority, count }));
      const formal = await tx.policyClaim.findMany({
        where: { id: { in: official.applicable.map((p) => p.claim_id) } },
        select: { authority: true },
      });
      const observed = await tx.decisionCase.findMany({
        where: { id: { in: comparable.map((c) => c.case_id) } },
        select: { authority: true },
      });
      const gap =
        official.status === 'SUPPORTED' &&
        observed.some((c) => !formal.some((p) => p.authority === c.authority));
      await this.audit.record(
        tx,
        actor,
        'TRUTH_RECONCILED',
        [
          ...official.applicable.map((c) => c.claim_id),
          ...comparable.map((c) => c.case_id),
        ],
        official.status,
      );
      return {
        official_truth: official,
        operational_truth: {
          ...practice,
          authority_pattern: pattern,
          comparable_sample_size: comparable.length,
        },
        gap_flag: gap,
        evidence_sufficiency:
          official.status === 'SUPPORTED'
            ? comparable.length
              ? 'SUPPORTED'
              : 'PARTIAL'
            : 'UNRESOLVED',
        limitations: [
          'Historical frequency does not authorize an exception or override the official rule.',
          ...(practice.truncated
            ? ['Precedent counts describe the returned sample only.']
            : []),
        ],
      };
    });
  }
}
