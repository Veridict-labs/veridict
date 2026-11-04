import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { answerInput, id, inquiryInput, pageInput } from '@veridict/contracts';
import { CurrentActor, type Actor } from '../auth/actor';
import { parse } from '../common/validation';
import { InquiriesService } from './inquiries.service';

@Controller('v1/inquiries')
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}
  @Post()
  create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.inquiries.create(actor, parse(inquiryInput, body).question);
  }
  @Get()
  list(@CurrentActor() actor: Actor, @Query() query: unknown) {
    const p = parse(pageInput, query);
    return this.inquiries.list(actor, p.limit, p.cursor);
  }
  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id') inquiryId: string) {
    return this.inquiries.get(actor, parse(id, inquiryId));
  }
  @Post(':id/answer')
  answer(
    @CurrentActor() actor: Actor,
    @Param('id') inquiryId: string,
    @Body() body: unknown,
  ) {
    return this.inquiries.answer(
      actor,
      parse(id, inquiryId),
      parse(answerInput, body),
    );
  }
}
