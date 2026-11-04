import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FeedbackInput } from '@veridict/contracts';
import { caseInput } from '@veridict/contracts';
import type { Actor } from '../auth/actor';
import { SecurityService } from '../auth/security.service';
import { AuditService } from '../audit/audit.service';
import { InquiriesService } from '../inquiries/inquiries.service';
import { PolicyService } from '../policy/policy.service';
import { parse } from '../common/validation';
import { maskPII } from '../knowledge/content';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly inquiries: InquiriesService,
    private readonly policy: PolicyService,
  ) {}
  submit(actor: Actor, input: FeedbackInput) {
    return this.security.scope(actor, false, async (tx) => {
      const inquiry = await this.inquiries.visible(tx, actor, input.inquiry_id);
      if (
        !inquiry.evidence.length ||
        inquiry.status === 'NEEDS_REVALIDATION' ||
        inquiry.status === 'PENDING'
      )
        throw new BadRequestException(
          'Feedback requires a completed inquiry with current evidence',
        );
      if (input.proposed_case) {
        if (
          input.proposed_case.domain !== input.domain ||
          input.proposed_case.evidence_chunk_ids.some(
            (id) => !inquiry.evidence.some((e) => e.chunkId === id),
          )
        )
          throw new BadRequestException(
            'Proposed precedent must reference inquiry evidence in the same domain',
          );
        await this.policy.validateCaseEvidence(
          tx,
          actor,
          input.proposed_case,
          false,
        );
      }
      const feedback = await tx.feedbackEvent.create({
        data: {
          inquiryId: inquiry.id,
          actorId: actor.id,
          domain: input.domain,
          action: input.action,
          reason: input.reason,
          proposedCase: input.proposed_case,
        },
      });
      await this.audit.record(
        tx,
        actor,
        'FEEDBACK_SUBMITTED',
        [feedback.id, inquiry.id],
        'PENDING_REVIEW',
      );
      return { feedback_id: feedback.id, status: feedback.status };
    });
  }
  pending(actor: Actor, domain: string) {
    return this.security.scope(actor, false, async (tx) => {
      this.security.requireReviewer(actor, domain);
      const rows = await tx.feedbackEvent.findMany({
        where: {
          domain,
          status: 'PENDING_REVIEW',
          inquiry: {
            orgId: actor.orgId,
            evidence: {
              some: {},
              every: {
                chunk: {
                  source: {
                    AND: [
                      this.security.sourceWhere(actor),
                      this.security.sourceWhere(actor, 'REVIEW'),
                    ],
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          id: true,
          inquiryId: true,
          reason: true,
          action: true,
          createdAt: true,
        },
      });
      return {
        results: rows.map((r) => ({
          feedback_id: r.id,
          inquiry_id: r.inquiryId,
          reason: maskPII(r.reason),
          action: r.action,
          created_at: r.createdAt,
        })),
      };
    });
  }
  review(
    actor: Actor,
    feedbackId: string,
    input: { decision: 'VALIDATED' | 'REJECTED'; reason: string },
  ) {
    return this.security.scope(actor, true, async (tx) => {
      const feedback = await tx.feedbackEvent.findFirst({
        where: { id: feedbackId, inquiry: { orgId: actor.orgId } },
      });
      if (!feedback) throw new NotFoundException();
      this.security.requireReviewer(actor, feedback.domain);
      if (feedback.actorId === actor.id)
        throw new ForbiddenException(
          'Feedback requires an independent reviewer',
        );
      const inquiry = await this.inquiries.visible(
        tx,
        actor,
        feedback.inquiryId,
        false,
      );
      if (!inquiry.evidence.length || inquiry.status === 'NEEDS_REVALIDATION')
        throw new NotFoundException();
      for (const e of inquiry.evidence)
        await this.security.source(tx, actor, e.chunk.sourceId, 'REVIEW');
      if (feedback.status !== 'PENDING_REVIEW')
        throw new ConflictException('Feedback already reviewed');
      let caseId: string | undefined;
      if (input.decision === 'VALIDATED' && feedback.proposedCase) {
        const proposed = parse(caseInput, feedback.proposedCase);
        if (proposed.domain !== feedback.domain)
          throw new BadRequestException('Invalid proposed domain');
        await this.policy.validateCaseEvidence(tx, actor, proposed, true);
        const record = await tx.decisionCase.create({
          data: {
            domain: proposed.domain,
            context: proposed.context,
            outcome: proposed.outcome,
            authority: proposed.authority,
            status: 'VALIDATED',
            reviewedBy: actor.id,
            evidence: {
              create: [...new Set(proposed.evidence_chunk_ids)].map(
                (chunkId) => ({ chunkId }),
              ),
            },
          },
        });
        caseId = record.id;
      }
      await tx.feedbackEvent.update({
        where: { id: feedbackId },
        data: {
          status: input.decision,
          reviewerId: actor.id,
          reviewReason: input.reason,
          caseId,
        },
      });
      await this.audit.record(
        tx,
        actor,
        'FEEDBACK_REVIEWED',
        [feedbackId, ...(caseId ? [caseId] : [])],
        input.decision,
      );
      return {
        feedback_id: feedbackId,
        status: input.decision,
        case_id: caseId ?? null,
      };
    });
  }
}
