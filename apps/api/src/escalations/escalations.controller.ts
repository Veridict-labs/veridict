import { Body, Controller, Delete, Param, Post, Put } from '@nestjs/common';
import {
  domainName,
  domainOwnerInput,
  escalationInput,
} from '@veridict/contracts';
import { CurrentActor, Roles, type Actor } from '../auth/actor';
import { parse } from '../common/validation';
import { EscalationsService } from './escalations.service';

@Controller('v1')
export class EscalationsController {
  constructor(private readonly service: EscalationsService) {}
  @Roles('ADMIN')
  @Put('domains/:domain/owner')
  save(
    @CurrentActor() actor: Actor,
    @Param('domain') domain: string,
    @Body() body: unknown,
  ) {
    return this.service.save(
      actor,
      parse(domainName, domain),
      parse(domainOwnerInput, body),
    );
  }
  @Roles('ADMIN')
  @Delete('domains/:domain/owner')
  remove(@CurrentActor() actor: Actor, @Param('domain') domain: string) {
    return this.service.remove(actor, parse(domainName, domain));
  }
  @Post('escalations/resolve')
  resolve(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.service.resolve(actor, parse(escalationInput, body).domain);
  }
}
