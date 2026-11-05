import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import type { Actor } from '../auth/actor';
import { DatabaseService } from '../database/database.service';

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}
  toolOutcome(
    actor: Actor,
    tool: string,
    decision: 'ALLOWED' | 'UNAVAILABLE',
    resultHash?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const start = await tx.auditEvent.findFirst({
        where: {
          orgId: actor.orgId,
          actorId: actor.id,
          toolCallId: actor.toolCallId,
          eventType: 'MCP_TOOL_STARTED',
        },
        select: { id: true },
      });
      if (!actor.toolCallId || !start)
        throw new Error('Unknown tool invocation');
      return this.record(
        tx,
        actor,
        decision === 'ALLOWED' ? 'MCP_TOOL_COMPLETED' : 'MCP_TOOL_DENIED',
        [],
        decision,
        { tool, ...(resultHash ? { result_hash: resultHash } : {}) },
      );
    });
  }
  record(
    tx: Prisma.TransactionClient,
    actor: Pick<Actor, 'id' | 'orgId'> &
      Partial<Pick<Actor, 'inquiryId' | 'toolCallId'>>,
    eventType: string,
    resourceRefs: string[] = [],
    decision = 'ALLOWED',
    metadata: Prisma.InputJsonObject = {},
    inquiryId: string | undefined = actor.inquiryId,
  ) {
    return tx.auditEvent.create({
      data: {
        orgId: actor.orgId,
        actorId: actor.id,
        eventType,
        resourceRefs,
        decision,
        metadata,
        inquiryId,
        toolCallId: actor.toolCallId,
      },
    });
  }
}
