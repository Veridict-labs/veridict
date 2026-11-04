import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import type { Actor } from '../auth/actor';

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuditService {
  record(
    tx: Prisma.TransactionClient,
    actor: Pick<Actor, 'id' | 'orgId'>,
    eventType: string,
    resourceRefs: string[] = [],
    decision = 'ALLOWED',
    metadata: Prisma.InputJsonObject = {},
  ) {
    return tx.auditEvent.create({
      data: {
        orgId: actor.orgId,
        actorId: actor.id,
        eventType,
        resourceRefs,
        decision,
        metadata,
      },
    });
  }
}
