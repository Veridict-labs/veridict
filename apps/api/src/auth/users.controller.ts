import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { pageInput, userInput, userUpdate, id } from '@veridict/contracts';
import { CurrentActor, Roles, type Actor } from './actor';
import { SecurityService } from './security.service';
import { hashPassword } from './password';
import { parse } from '../common/validation';
import { AuditService } from '../audit/audit.service';

const publicUser = { id: true, email: true, name: true, role: true, department: true, active: true, reviewDomains: true } as const;

@Roles('ADMIN')
@Controller('v1/users')
export class UsersController {
  constructor(private readonly security: SecurityService, private readonly audit: AuditService) {}
  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: unknown) {
    const page = parse(pageInput, query);
    return this.security.scope(actor, false, async tx => {
      this.security.requireAdmin(actor);
      return tx.user.findMany({ where: { orgId: actor.orgId }, select: publicUser, orderBy: { id: 'asc' }, take: page.limit, ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}) });
    });
  }
  @Post()
  async create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(userInput, body);
    const passwordHash = await hashPassword(input.password);
    return this.security.scope(actor, true, async tx => {
      this.security.requireAdmin(actor);
      const user = await tx.user.create({ data: { orgId: actor.orgId, email: input.email.toLowerCase(), name: input.name, passwordHash, role: input.role, department: input.department, reviewDomains: input.review_domains }, select: publicUser });
      await this.audit.record(tx, actor, 'USER_CREATED', [user.id]);
      return user;
    });
  }
  @Patch(':id')
  update(@CurrentActor() actor: Actor, @Param('id') userId: string, @Body() body: unknown) {
    parse(id, userId);
    const input = parse(userUpdate, body);
    return this.security.scope(actor, true, async tx => {
      this.security.requireAdmin(actor);
      const user = await tx.user.findFirst({ where: { id: userId, orgId: actor.orgId } });
      if (!user) throw new NotFoundException();
      if (user.role === 'ADMIN' && (input.active === false || (input.role && input.role !== 'ADMIN')) && await tx.user.count({ where: { orgId: actor.orgId, active: true, role: 'ADMIN' } }) <= 1) throw new ForbiddenException('The organization must retain an active administrator');
      const updated = await tx.user.update({ where: { id: userId }, data: { active: input.active, role: input.role, department: input.department, reviewDomains: input.review_domains }, select: publicUser });
      if (input.active === false) await tx.session.deleteMany({ where: { userId } });
      await this.security.bump(tx, actor);
      await this.audit.record(tx, actor, 'USER_UPDATED', [userId]);
      return updated;
    });
  }
}
