import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService, digest } from '../audit/audit.service';
import { SecurityService } from './security.service';
import { hashPassword, verifyPassword } from './password';
import type { Actor } from './actor';
import type { SessionKind } from '../generated/prisma/client';

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(randomBytes(32).toString('hex'));
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly security: SecurityService,
  ) {}

  async authenticate(token: string): Promise<Actor> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(token) },
      include: { user: { include: { organization: true } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.active)
      throw new UnauthorizedException();
    const user = session.user;
    return {
      id: user.id,
      orgId: user.orgId,
      role: user.role,
      department: user.department,
      reviewDomains: user.reviewDomains,
      sessionId: session.id,
      sessionKind: session.kind,
      permissionVersion: user.organization.permissionVersion,
      inquiryId: session.inquiryId ?? undefined,
    };
  }

  async login(input: { org_slug: string; email: string; password: string }) {
    const user = await this.db.user.findFirst({
      where: {
        email: input.email.toLowerCase(),
        organization: { slug: input.org_slug },
      },
    });
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user?.active || !valid)
      throw new UnauthorizedException('Invalid credentials');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${user.orgId}::uuid FOR SHARE`;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      if (!current.active || current.passwordHash !== user.passwordHash)
        throw new UnauthorizedException();
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
      await tx.session.create({
        data: { userId: user.id, tokenHash: digest(token), expiresAt },
      });
      await this.audit.record(tx, user, 'AUTH_LOGIN');
      return {
        access_token: token,
        token_type: 'Bearer',
        expires_at: expiresAt.toISOString(),
      };
    });
  }

  async issueToolToken(actor: Actor, inquiryId?: string) {
    if (actor.sessionKind !== 'USER') throw new UnauthorizedException();
    if (inquiryId) actor = this.security.forInquiry(actor, inquiryId);
    return this.security.scope(actor, false, async (tx) => {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await tx.session.create({
        data: {
          userId: actor.id,
          tokenHash: digest(token),
          kind: 'AGENT' as SessionKind,
          expiresAt,
          inquiryId: actor.inquiryId,
        },
      });
      await this.audit.record(tx, actor, 'AUTH_TOOL_TOKEN');
      return {
        access_token: token,
        token_type: 'Bearer',
        expires_at: expiresAt.toISOString(),
      };
    });
  }
  async logout(actor: Actor) {
    return this.security.scope(actor, false, async (tx) => {
      await tx.session.delete({ where: { id: actor.sessionId } });
      await this.audit.record(tx, actor, 'AUTH_LOGOUT');
      return { revoked: true };
    });
  }
}
