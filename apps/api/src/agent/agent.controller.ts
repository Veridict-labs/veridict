import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { id } from '@veridict/contracts';
import { z } from 'zod';
import { CurrentActor, Roles, type Actor } from '../auth/actor';
import { parse } from '../common/validation';
import { AgentService } from './agent.service';

@Controller('v1/inquiries')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Roles('EMPLOYEE', 'REVIEWER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':id/run')
  run(
    @CurrentActor() actor: Actor,
    @Param('id') inquiryId: string,
    @Body() body: unknown,
  ) {
    parse(z.strictObject({}), body ?? {});
    return this.agent.run(actor, parse(id, inquiryId));
  }
}
