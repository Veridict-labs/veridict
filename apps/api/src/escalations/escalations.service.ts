import { Injectable, NotFoundException } from '@nestjs/common';
import { SecurityService } from '../auth/security.service';
import { AuditService, digest } from '../audit/audit.service';
import type { Actor } from '../auth/actor';
import type { Prisma } from '../generated/prisma/client';
import { maskPII } from '../knowledge/content';

@Injectable()
export class EscalationsService {
  constructor(
    private readonly security: SecurityService,
    private readonly audit: AuditService,
  ) {}

  async resolveIn(tx: Prisma.TransactionClient, actor: Actor, domain: string) {
    const record = await tx.domainOwner.findFirst({
      where: {
        orgId: actor.orgId,
        domain,
        owner: { active: true },
        chunk: { source: this.security.sourceWhere(actor) },
      },
      include: {
        owner: { select: { name: true } },
        chunk: { select: { sourceId: true } },
      },
    });
    if (!record)
      return { status: 'UNAVAILABLE' as const, owner: null, evidence: null };
    return {
      status: 'AVAILABLE' as const,
      owner: {
        name: maskPII(record.owner.name),
        contact_email: record.contactEmail,
      },
      evidence: { source_id: record.chunk.sourceId, chunk_id: record.chunkId },
    };
  }
  resolve(actor: Actor, domain: string) {
    return this.security.scope(actor, false, async (tx) => {
      const result = await this.resolveIn(tx, actor, domain);
      await this.audit.record(
        tx,
        actor,
        'ESCALATION_RESOLVED',
        result.evidence ? [result.evidence.source_id] : [],
        result.status,
        { domain_hash: digest(domain) },
      );
      return result;
    });
  }
  save(
    actor: Actor,
    domain: string,
    input: {
      owner_id: string;
      evidence_chunk_id: string;
      contact_email: string;
    },
  ) {
    return this.security.scope(actor, true, async (tx) => {
      this.security.requireAdmin(actor);
      const owner = await tx.user.findFirst({
        where: { id: input.owner_id, orgId: actor.orgId, active: true },
      });
      if (!owner) throw new NotFoundException();
      const [chunk] = await this.security.chunks(tx, actor, [
        input.evidence_chunk_id,
      ]);
      await this.security.source(tx, actor, chunk.sourceId, 'REVIEW');
      const data = {
        ownerId: owner.id,
        chunkId: chunk.id,
        contactEmail: input.contact_email,
      };
      const record = await tx.domainOwner.upsert({
        where: { orgId_domain: { orgId: actor.orgId, domain } },
        create: { orgId: actor.orgId, domain, ...data },
        update: data,
      });
      await tx.inquiry.updateMany({
        where: { orgId: actor.orgId, escalationDomain: domain },
        data: { status: 'NEEDS_REVALIDATION' },
      });
      await this.audit.record(tx, actor, 'DOMAIN_OWNER_UPDATED', [
        record.id,
        chunk.sourceId,
      ]);
      return { updated: true };
    });
  }
  remove(actor: Actor, domain: string) {
    return this.security.scope(actor, true, async (tx) => {
      this.security.requireAdmin(actor);
      await tx.domainOwner.deleteMany({
        where: { orgId: actor.orgId, domain },
      });
      await tx.inquiry.updateMany({
        where: { orgId: actor.orgId, escalationDomain: domain },
        data: { status: 'NEEDS_REVALIDATION' },
      });
      await this.audit.record(
        tx,
        actor,
        'DOMAIN_OWNER_REMOVED',
        [],
        'ALLOWED',
        { domain_hash: digest(domain) },
      );
      return { removed: true };
    });
  }
}
