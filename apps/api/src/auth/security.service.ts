import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma, PermissionAction } from '../generated/prisma/client';
import type { Actor } from './actor';

@Injectable()
export class SecurityService {
  constructor(private readonly db: DatabaseService) {}

  async scope<T>(actor: Actor, write: boolean, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(async tx => {
      // ACL changes take an exclusive organization lock. A completed revocation
      // cannot race a protected read or allow a partially persisted answer.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Organization" WHERE id = ${actor.orgId}::uuid ${write ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`}`);
      const session = await tx.session.findFirst({ where: { id: actor.sessionId, userId: actor.id, expiresAt: { gt: new Date() } }, include: { user: true } });
      const user = session?.user;
      if (!user?.active || user.orgId !== actor.orgId || user.role !== actor.role || user.department !== actor.department || JSON.stringify(user.reviewDomains) !== JSON.stringify(actor.reviewDomains)) throw new UnauthorizedException();
      return run(tx);
    }, { timeout: 15000, maxWait: 5000 });
  }

  requireAdmin(actor: Actor) {
    if (actor.role !== 'ADMIN' || actor.sessionKind !== 'USER') throw new ForbiddenException();
  }
  requireReviewer(actor: Actor, domain: string) {
    if (actor.sessionKind !== 'USER' || (actor.role !== 'ADMIN' && (actor.role !== 'REVIEWER' || !actor.reviewDomains.includes(domain)))) throw new ForbiddenException();
  }
  sourceWhere(actor: Actor, action: PermissionAction = 'READ'): Prisma.KnowledgeSourceWhereInput {
    return { orgId: actor.orgId, permissions: { some: {
      action, OR: [
        { subjectType: 'USER', subjectId: actor.id },
        { subjectType: 'DEPARTMENT', subjectId: actor.department },
        { subjectType: 'ORGANIZATION', subjectId: actor.orgId },
      ],
    } } };
  }
  async source(tx: Prisma.TransactionClient, actor: Actor, sourceId: string, action: PermissionAction = 'READ') {
    const source = await tx.knowledgeSource.findFirst({ where: { id: sourceId, ...this.sourceWhere(actor, action) } });
    if (!source) throw new NotFoundException();
    return source;
  }
  async chunks(tx: Prisma.TransactionClient, actor: Actor, chunkIds: string[], action: PermissionAction = 'READ') {
    const unique = [...new Set(chunkIds)];
    const chunks = await tx.sourceChunk.findMany({ where: { id: { in: unique }, source: this.sourceWhere(actor, action) }, include: { source: true } });
    if (chunks.length !== unique.length) throw new NotFoundException();
    return chunks;
  }
  async bump(tx: Prisma.TransactionClient, actor: Actor) {
    await tx.organization.update({ where: { id: actor.orgId }, data: { permissionVersion: { increment: 1 } } });
  }
}
