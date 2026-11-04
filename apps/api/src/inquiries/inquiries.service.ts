import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { Actor } from '../auth/actor';
import { SecurityService } from '../auth/security.service';
import { AuditService, digest } from '../audit/audit.service';
import { evidence, maskPII } from '../knowledge/content';
import type { AnswerInput } from '@veridict/contracts';
import { answerInput } from '@veridict/contracts';
import type { Prisma } from '../generated/prisma/client';

@Injectable()
export class InquiriesService {
  constructor(
    private readonly security: SecurityService,
    private readonly audit: AuditService,
  ) {}
  async visible(
    tx: Prisma.TransactionClient,
    actor: Actor,
    inquiryId: string,
    ownerOnly = true,
  ) {
    const inquiry = await tx.inquiry.findFirst({
      where: {
        id: inquiryId,
        orgId: actor.orgId,
        ...(ownerOnly ? { askerId: actor.id } : {}),
        evidence: {
          every: { chunk: { source: this.security.sourceWhere(actor) } },
        },
      },
      include: {
        evidence: { include: { chunk: { include: { source: true } } } },
      },
    });
    if (!inquiry) throw new NotFoundException();
    return inquiry;
  }
  create(actor: Actor, question: string) {
    return this.security.scope(actor, false, async (tx) => {
      if (actor.sessionKind !== 'USER') throw new ForbiddenException();
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: actor.orgId },
      });
      const inquiry = await tx.inquiry.create({
        data: {
          orgId: actor.orgId,
          askerId: actor.id,
          question,
          permissionVersion: organization.permissionVersion,
        },
      });
      await this.audit.record(
        tx,
        actor,
        'INQUIRY_CREATED',
        [inquiry.id],
        'PENDING',
        { question_hash: digest(question) },
      );
      return {
        inquiry_id: inquiry.id,
        status: inquiry.status,
        orchestration: 'AWAITING_AGENT',
        created_at: inquiry.createdAt,
      };
    });
  }
  get(actor: Actor, inquiryId: string) {
    return this.security.scope(actor, false, async (tx) => {
      const inquiry = await this.visible(tx, actor, inquiryId);
      const stale = inquiry.status === 'NEEDS_REVALIDATION';
      const structured = inquiry.structuredAnswer
        ? answerInput.parse(inquiry.structuredAnswer)
        : null;
      const safeStatement = (value: AnswerInput['official_truth']) =>
        value ? { ...value, statement: maskPII(value.statement) } : null;
      await this.audit.record(tx, actor, 'INQUIRY_OPENED', [inquiry.id]);
      return {
        inquiry_id: inquiry.id,
        question: maskPII(inquiry.question),
        status: inquiry.status,
        answer: stale ? null : inquiry.answer ? maskPII(inquiry.answer) : null,
        assumptions: stale ? [] : inquiry.assumptions.map(maskPII),
        limitations: stale
          ? ['Evidence has changed; the answer needs revalidation.']
          : inquiry.limitations.map(maskPII),
        citations: stale ? [] : inquiry.evidence.map((e) => evidence(e.chunk)),
        official_truth: stale
          ? null
          : safeStatement(structured?.official_truth ?? null),
        operational_truth: stale
          ? null
          : safeStatement(structured?.operational_truth ?? null),
        conflicts: stale
          ? []
          : (structured?.conflicts.map((c) => safeStatement(c)) ?? []),
        decision_trail: stale
          ? []
          : (structured?.decision_trail.map((n) => ({
              ...n,
              label: maskPII(n.label),
            })) ?? []),
        created_at: inquiry.createdAt,
        updated_at: inquiry.updatedAt,
      };
    });
  }
  list(actor: Actor, limit: number, cursor?: string) {
    return this.security.scope(actor, false, async (tx) => {
      const rows = await tx.inquiry.findMany({
        where: {
          orgId: actor.orgId,
          askerId: actor.id,
          evidence: {
            every: { chunk: { source: this.security.sourceWhere(actor) } },
          },
        },
        orderBy: { id: 'asc' },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, status: true, createdAt: true },
      });
      return {
        results: rows.map((r) => ({
          inquiry_id: r.id,
          status: r.status,
          created_at: r.createdAt,
        })),
        next_cursor: rows.length === limit ? rows.at(-1)!.id : null,
      };
    });
  }
  answer(actor: Actor, inquiryId: string, input: AnswerInput) {
    if (actor.sessionKind !== 'AGENT')
      throw new ForbiddenException('A delegated agent session is required');
    return this.security.scope(actor, true, async (tx) => {
      const inquiry = await this.visible(tx, actor, inquiryId);
      if (!['PENDING', 'NEEDS_REVALIDATION'].includes(inquiry.status))
        throw new ConflictException('Inquiry already completed');
      const citations = [
        ...input.citations,
        ...(input.official_truth?.evidence ?? []),
        ...(input.operational_truth?.evidence ?? []),
        ...input.conflicts.flatMap((c) => c.evidence),
        ...input.decision_trail.flatMap((n) => n.evidence),
      ];
      const chunks = await this.security.chunks(
        tx,
        actor,
        citations.map((c) => c.chunk_id),
      );
      if (
        citations.some(
          (c) =>
            !chunks.some(
              (chunk) =>
                chunk.id === c.chunk_id && chunk.sourceId === c.source_id,
            ),
        )
      )
        throw new NotFoundException();
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: actor.orgId },
      });
      await tx.inquiryEvidence.deleteMany({ where: { inquiryId } });
      await tx.inquiry.update({
        where: { id: inquiryId },
        data: {
          status: input.status,
          answer: input.answer,
          assumptions: input.assumptions,
          limitations: input.limitations,
          permissionVersion: organization.permissionVersion,
          structuredAnswer: input,
          evidence: { create: chunks.map((c) => ({ chunkId: c.id })) },
        },
      });
      await this.audit.record(
        tx,
        actor,
        'INQUIRY_ANSWERED',
        [inquiryId, ...chunks.map((c) => c.id)],
        input.status,
        { answer_hash: digest(input.answer) },
      );
      return { inquiry_id: inquiryId, status: input.status };
    });
  }
}
