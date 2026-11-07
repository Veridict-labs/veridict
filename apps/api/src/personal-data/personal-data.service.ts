import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  personalDataRequest,
  type personalDataGrant,
} from '@veridict/contracts';
import type { Inquiry, Prisma } from '../generated/prisma/client';
import type { Actor } from '../auth/actor';
import { SecurityService } from '../auth/security.service';
import { AuditService, digest } from '../audit/audit.service';
import { personalDataSpans, readPersonalDataSpans } from '../knowledge/content';
import type { z } from 'zod';
import { explicitlyRequests } from './personal-data.intent';
import { Clock } from '../common/clock';

export { explicitlyRequests } from './personal-data.intent';

type Request = z.infer<typeof personalDataRequest>;
type Grant = z.infer<typeof personalDataGrant>;

@Injectable()
export class PersonalDataService {
  constructor(
    private readonly security: SecurityService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async validateRequest(
    tx: Prisma.TransactionClient,
    actor: Actor,
    question: string,
    request: Request,
  ) {
    if (!explicitlyRequests(question, request.field_type))
      throw new BadRequestException(
        'Question must explicitly request the declared personal-data field',
      );
    const [chunk] = await this.security.chunks(tx, actor, [request.chunk_id]);
    if (chunk.sourceId !== request.source_id) throw new NotFoundException();
    return chunk;
  }

  replaceGrants(actor: Actor, sourceId: string, grants: Grant[]) {
    return this.security.scope(actor, true, async (tx) => {
      this.security.requireAdmin(actor);
      if (
        !(await tx.knowledgeSource.findFirst({
          where: { id: sourceId, orgId: actor.orgId },
          select: { id: true },
        }))
      )
        throw new NotFoundException();
      for (const grant of grants) {
        if (
          grant.subject_type === 'ORGANIZATION' &&
          grant.subject_id !== actor.orgId
        )
          throw new BadRequestException('Invalid personal-data grant');
        if (
          grant.subject_type === 'USER' &&
          !(await tx.user.findFirst({
            where: { id: grant.subject_id, orgId: actor.orgId },
            select: { id: true },
          }))
        )
          throw new BadRequestException('Invalid personal-data grant');
      }
      await tx.personalDataGrant.deleteMany({ where: { sourceId } });
      await tx.personalDataGrant.createMany({
        data: grants.map((g) => ({
          sourceId,
          fieldType: g.field_type,
          purpose: g.purpose,
          subjectType: g.subject_type,
          subjectId: g.subject_id,
        })),
        skipDuplicates: true,
      });
      await this.security.bump(tx, actor);
      await this.audit.record(tx, actor, 'PERSONAL_DATA_GRANTS_REPLACED', [
        sourceId,
      ]);
      return { updated: true };
    });
  }

  async authorizedValue(
    tx: Prisma.TransactionClient,
    actor: Actor,
    inquiry: Pick<Inquiry, 'question' | 'personalDataRequest'>,
  ) {
    const parsed = personalDataRequest.safeParse(inquiry.personalDataRequest);
    if (
      !parsed.success ||
      !explicitlyRequests(inquiry.question, parsed.data.field_type)
    )
      return null;
    const request = parsed.data;
    const grant = await tx.personalDataGrant.findFirst({
      where: {
        sourceId: request.source_id,
        fieldType: request.field_type,
        purpose: request.purpose,
        OR: [
          { subjectType: 'USER', subjectId: actor.id },
          { subjectType: 'DEPARTMENT', subjectId: actor.department },
          { subjectType: 'ORGANIZATION', subjectId: actor.orgId },
        ],
      },
      select: { id: true },
    });
    if (!grant) return null;
    const chunk = await tx.sourceChunk.findFirst({
      where: {
        id: request.chunk_id,
        sourceId: request.source_id,
        source: this.security.sourceWhere(actor),
      },
      include: {
        source: {
          include: {
            supersededBy: { select: { state: true, validFrom: true } },
          },
        },
      },
    });
    if (!chunk) return null;
    const replacement = chunk.source.supersededBy;
    if (
      replacement?.state === 'APPROVED' &&
      replacement.validFrom &&
      replacement.validFrom <= this.clock.now()
    )
      return null;
    const values = [
      ...new Set(
        personalDataSpans(
          chunk.content,
          readPersonalDataSpans(chunk.personalDataSpans),
        )
          .filter((s) => s.field_type === request.field_type && s.complete)
          .map((s) => s.value),
      ),
    ];
    if (values.length !== 1) return null;
    return { ...request, value: values[0] };
  }

  disclose(actor: Actor, inquiryId: string, sourceId: string, chunkId: string) {
    actor = this.security.forInquiry(actor, inquiryId);
    return this.security.scope(actor, false, async (tx) => {
      const inquiry = await tx.inquiry.findUniqueOrThrow({
        where: { id: inquiryId },
      });
      const value = await this.authorizedValue(tx, actor, inquiry);
      if (!value || value.source_id !== sourceId || value.chunk_id !== chunkId)
        throw new NotFoundException();
      await this.audit.record(
        tx,
        actor,
        'PERSONAL_DATA_DISCLOSED',
        [sourceId, chunkId],
        'ALLOWED',
        {
          field_type: value.field_type,
          purpose: value.purpose,
          value_hash: digest(value.value),
        },
      );
      return { inquiry_id: inquiryId, ...value };
    });
  }
}
