import { Body, Controller, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { id, personalDataGrant } from '@veridict/contracts';
import { CurrentActor, Roles, type Actor } from '../auth/actor';
import { parse } from '../common/validation';
import { PersonalDataService } from './personal-data.service';

@Controller('v1/sources')
export class PersonalDataController {
  constructor(private readonly service: PersonalDataService) {}
  @Roles('ADMIN')
  @Put(':id/personal-data-grants')
  grants(
    @CurrentActor() actor: Actor,
    @Param('id') sourceId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.strictObject({ grants: z.array(personalDataGrant).max(100) }),
      body,
    );
    return this.service.replaceGrants(actor, parse(id, sourceId), input.grants);
  }
  @Post(':id/personal-data')
  disclose(
    @CurrentActor() actor: Actor,
    @Param('id') sourceId: string,
    @Body() body: unknown,
  ) {
    const input = parse(z.strictObject({ inquiry_id: id, chunk_id: id }), body);
    return this.service.disclose(
      actor,
      input.inquiry_id,
      parse(id, sourceId),
      input.chunk_id,
    );
  }
}
