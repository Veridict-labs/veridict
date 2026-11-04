import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { pageInput } from '@veridict/contracts';
import { CurrentActor, Roles, type Actor } from '../auth/actor';
import { SecurityService } from '../auth/security.service';
import { AuditService } from './audit.service';
import { parse } from '../common/validation';

@Roles('ADMIN')
@Controller('v1/audit')
export class AuditController {
  constructor(
    private readonly security: SecurityService,
    private readonly audit: AuditService,
  ) {}
  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: unknown) {
    const page = parse(pageInput, query);
    return this.security.scope(actor, false, async (tx) => {
      this.security.requireAdmin(actor);
      const results = await tx.auditEvent.findMany({
        where: { orgId: actor.orgId },
        orderBy: { id: 'asc' },
        take: page.limit,
        ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      });
      return {
        results,
        next_cursor: results.length === page.limit ? results.at(-1)!.id : null,
      };
    });
  }
  @Post('prune')
  prune(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(
      z.strictObject({
        retention_days: z.number().int().min(1).max(3650).default(30),
      }),
      body,
    );
    return this.security.scope(actor, true, async (tx) => {
      this.security.requireAdmin(actor);
      const cutoff = new Date(Date.now() - input.retention_days * 86400000);
      const result = await tx.auditEvent.deleteMany({
        where: { orgId: actor.orgId, createdAt: { lt: cutoff } },
      });
      await this.audit.record(tx, actor, 'AUDIT_PRUNED', [], 'ALLOWED', {
        deleted_count: result.count,
        retention_days: input.retention_days,
      });
      return { deleted_count: result.count };
    });
  }
}
