import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  evidenceInput,
  id,
  ingestInput,
  permission,
  searchInput,
} from '@veridict/contracts';
import { KnowledgeService } from './knowledge.service';
import { CurrentActor, Roles, type Actor } from '../auth/actor';
import { parse } from '../common/validation';

@Controller('v1')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}
  @Roles('ADMIN')
  @Post('knowledge/preview')
  preview(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.knowledge.preview(actor, parse(ingestInput, body));
  }
  @Roles('ADMIN')
  @Post('knowledge/ingest')
  ingest(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.knowledge.ingest(actor, parse(ingestInput, body));
  }
  @Post('knowledge/search')
  search(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.knowledge.search(actor, parse(searchInput, body));
  }
  @Roles('ADMIN')
  @Put('sources/:id/permissions')
  permissions(
    @CurrentActor() actor: Actor,
    @Param('id') sourceId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.strictObject({ permissions: z.array(permission).max(100) }),
      body,
    );
    return this.knowledge.replacePermissions(
      actor,
      parse(id, sourceId),
      input.permissions,
    );
  }
  @Get('sources/:id/evidence')
  evidence(
    @CurrentActor() actor: Actor,
    @Param('id') sourceId: string,
    @Query() query: unknown,
  ) {
    const input = parse(evidenceInput, {
      source_id: sourceId,
      ...parse(z.strictObject({ chunk_id: id }), query),
    });
    return this.knowledge.getEvidence(actor, input.source_id, input.chunk_id);
  }
}
