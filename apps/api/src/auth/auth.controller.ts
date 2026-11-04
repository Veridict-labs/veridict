import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginInput } from '@veridict/contracts';
import { AuthService } from './auth.service';
import { CurrentActor, Public, type Actor } from './actor';
import { parse } from '../common/validation';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  login(@Body() body: unknown) { return this.auth.login(parse(loginInput, body)); }
  @Get('me')
  me(@CurrentActor() actor: Actor) {
    return { id: actor.id, org_id: actor.orgId, role: actor.role, department: actor.department, review_domains: actor.reviewDomains, permission_version: actor.permissionVersion, session_kind: actor.sessionKind };
  }
  @Post('tool-token')
  toolToken(@CurrentActor() actor: Actor) { return this.auth.issueToolToken(actor); }
  @Post('logout')
  logout(@CurrentActor() actor: Actor) { return this.auth.logout(actor); }
}
