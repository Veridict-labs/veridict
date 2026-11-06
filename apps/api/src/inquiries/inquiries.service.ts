import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { Actor } from '../auth/actor';
import { SecurityService } from '../auth/security.service';
import { AuditService, digest } from '../audit/audit.service';
import { evidence, maskPII, maskUsingChunks } from '../knowledge/content';
import type { AnswerInput, InquiryInput } from '@veridict/contracts';
import { answerInput } from '@veridict/contracts';
import type { Prisma } from '../generated/prisma/client';
import { EscalationsService } from '../escalations/escalations.service';
import { PersonalDataService } from '../personal-data/personal-data.service';

@Injectable()
export class InquiriesService {
  constructor(
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly escalations: EscalationsService,
    private readonly personalData: PersonalDataService,
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
        evidence: {
          include: {
            chunk: {
              include: {
                source: {
                  include: {
                    supersededBy: {
                      select: {
                        state: true,
                        validFrom: true,
                        recordedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!inquiry) throw new NotFoundException();
    if (
      inquiry.evidence.some((e) => {
        const replacement = e.chunk.source.supersededBy;
        return (
          replacement?.state === 'APPROVED' &&
          replacement.validFrom &&
          replacement.validFrom <= new Date() &&
          (replacement.validFrom > inquiry.updatedAt ||
            replacement.recordedAt > inquiry.updatedAt)
        );
      })
    ) {
      return { ...inquiry, status: 'NEEDS_REVALIDATION' as const };
    }
    return inquiry;
  }
  create(actor: Actor, input: InquiryInput) {
    const { question } = input;
    return this.security.scope(actor, false, async (tx) => {
      if (actor.sessionKind !== 'USER') throw new ForbiddenException();
      const target = input.personal_data_request
        ? await this.personalData.validateRequest(
            tx,
            actor,
            question,
            input.personal_data_request,
          )
        : null;
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: actor.orgId },
      });
      const inquiry = await tx.inquiry.create({
        data: {
          orgId: actor.orgId,
          askerId: actor.id,
          question,
          personalDataRequest: input.personal_data_request,
          evidence: target ? { create: { chunkId: target.id } } : undefined,
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
        inquiry.id,
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
    actor = this.security.forInquiry(actor, inquiryId);
    return this.security.scope(actor, false, async (tx) => {
      const inquiry = await this.visible(tx, actor, inquiryId);
      const stale = inquiry.status === 'NEEDS_REVALIDATION';
      const personal = !stale
        ? await this.personalData.authorizedValue(tx, actor, inquiry)
        : null;
      const chunks = inquiry.evidence.map((e) => e.chunk);
      const redact = (v: string) => maskUsingChunks(v, chunks);
      const renderedAnswer = stale
        ? null
        : inquiry.answer
          ? maskUsingChunks(
              inquiry.answer,
              chunks,
              personal ? [personal.value] : [],
            )
          : null;
      if (
        personal &&
        inquiry.answer &&
        renderedAnswer !== redact(inquiry.answer)
      )
        await this.audit.record(
          tx,
          actor,
          'PERSONAL_DATA_ANSWER_VIEWED',
          [personal.source_id, personal.chunk_id],
          'ALLOWED',
          {
            field_type: personal.field_type,
            purpose: personal.purpose,
            value_hash: digest(personal.value),
          },
        );
      const structured = inquiry.structuredAnswer
        ? answerInput.parse(inquiry.structuredAnswer)
        : null;
      const safeStatement = (value: AnswerInput['official_truth']) =>
        value ? { ...value, statement: redact(value.statement) } : null;
      await this.audit.record(tx, actor, 'INQUIRY_OPENED', [inquiry.id]);
      return {
        inquiry_id: inquiry.id,
        question: maskPII(inquiry.question),
        status: inquiry.status,
        escalation:
          !stale &&
          inquiry.status === 'INSUFFICIENT_EVIDENCE' &&
          inquiry.escalationDomain
            ? await this.escalations.resolveIn(
                tx,
                actor,
                inquiry.escalationDomain,
              )
            : null,
        answer: renderedAnswer,
        assumptions: stale ? [] : inquiry.assumptions.map(redact),
        limitations: stale
          ? ['Evidence has changed; the answer needs revalidation.']
          : inquiry.limitations.map(redact),
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
              label: redact(n.label),
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
  answer(
    actor: Actor,
    inquiryId: string,
    input: AnswerInput,
    contextEvidence: { source_id: string; chunk_id: string }[] = [],
  ) {
    actor = this.security.forInquiry(actor, inquiryId);
    if (actor.sessionKind !== 'AGENT')
      throw new ForbiddenException('A delegated agent session is required');
    return this.security.scope(actor, true, async (tx) => {
      const inquiry = await this.visible(tx, actor, inquiryId);
      if (!['PENDING', 'NEEDS_REVALIDATION'].includes(inquiry.status))
        throw new ConflictException('Inquiry already completed');
      const citations = [
        // Internal runtime ledger: all model-exposed chunks participate in revocation,
        // even when a draft omits a citation or the grounding check abstains.
        ...contextEvidence,
        ...input.citations,
        ...(input.official_truth?.evidence ?? []),
        ...(input.operational_truth?.evidence ?? []),
        ...input.conflicts.flatMap((c) => c.evidence),
        ...input.decision_trail.flatMap((n) => n.evidence),
      ];
      const escalation =
        input.status === 'INSUFFICIENT_EVIDENCE' && input.escalation_domain
          ? await this.escalations.resolveIn(tx, actor, input.escalation_domain)
          : null;
      const references = [
        ...citations,
        ...(escalation?.evidence ? [escalation.evidence] : []),
      ];
      if (inquiry.personalDataRequest) {
        const request = inquiry.personalDataRequest as {
          source_id: string;
          chunk_id: string;
        };
        references.push({
          source_id: request.source_id,
          chunk_id: request.chunk_id,
        });
      }
      const chunks = await this.security.chunks(
        tx,
        actor,
        references.map((c) => c.chunk_id),
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
          escalationDomain: input.escalation_domain ?? null,
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

  trace(actor: Actor, inquiryId: string, limit: number, cursor?: string) {
    actor = this.security.forInquiry(actor, inquiryId);
    return this.security.scope(actor, false, async (tx) => {
      const rows = await tx.auditEvent.findMany({
        where: { orgId: actor.orgId, inquiryId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const refs = [...new Set(rows.flatMap((r) => r.resourceRefs))];
      const sources = await tx.knowledgeSource.findMany({
        where: { id: { in: refs }, ...this.security.sourceWhere(actor) },
        select: { id: true },
      });
      const chunks = await tx.sourceChunk.findMany({
        where: { id: { in: refs }, source: this.security.sourceWhere(actor) },
        select: { id: true },
      });
      const allowed = new Set([
        inquiryId,
        ...sources.map((s) => s.id),
        ...chunks.map((c) => c.id),
      ]);
      return {
        inquiry_id: inquiryId,
        results: rows.map((r) => ({
          event_id: r.id,
          event_type: r.eventType,
          tool_call_id: r.toolCallId,
          decision: r.decision,
          resource_refs: r.resourceRefs.filter((id) => allowed.has(id)),
          metadata: r.metadata,
          created_at: r.createdAt,
        })),
        next_cursor: rows.length === limit ? rows.at(-1)!.id : null,
      };
    });
  }
}
