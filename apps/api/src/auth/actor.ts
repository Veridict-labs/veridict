import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Role, SessionKind } from '../generated/prisma/client';

export type Actor = {
  id: string;
  orgId: string;
  role: Role;
  department: string;
  reviewDomains: string[];
  sessionId: string;
  sessionKind: SessionKind;
  permissionVersion: number;
  inquiryId?: string;
  toolCallId?: string;
};
export type AuthRequest = Request & { actor: Actor };
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor =>
    ctx.switchToHttp().getRequest<AuthRequest>().actor,
);
