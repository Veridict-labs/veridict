import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import type { AuthRequest } from './actor';
import type { Role } from '../generated/prisma/client';
import { SecurityService } from './security.service';
import { id } from '@veridict/contracts';
import { parse } from '../common/validation';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
    private readonly security: SecurityService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([a-f0-9]{64})$/.exec(
      request.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException();
    request.actor = await this.auth.authenticate(match[1]);
    const inquiryHeader = request.headers['x-inquiry-id'];
    if (inquiryHeader !== undefined) {
      const scoped = this.security.forInquiry(
        request.actor,
        parse(id, inquiryHeader),
      );
      request.actor = await this.security.scope(
        scoped,
        false,
        async () => scoped,
      );
    }
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      roles &&
      (request.actor.sessionKind !== 'USER' ||
        !roles.includes(request.actor.role))
    )
      throw new ForbiddenException();
    return true;
  }
}
