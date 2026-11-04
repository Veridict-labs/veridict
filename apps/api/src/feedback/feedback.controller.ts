import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { feedbackInput, feedbackReview, id } from '@veridict/contracts';
import { CurrentActor, type Actor } from '../auth/actor';
import { parse } from '../common/validation';
import { FeedbackService } from './feedback.service';

@Controller('v1/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}
  @Post()
  submit(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.feedback.submit(actor, parse(feedbackInput, body));
  }
  @Get()
  pending(@CurrentActor() actor: Actor, @Query() query: unknown) {
    return this.feedback.pending(
      actor,
      parse(z.strictObject({ domain: z.string().min(1).max(80) }), query)
        .domain,
    );
  }
  @Post(':id/validate')
  review(
    @CurrentActor() actor: Actor,
    @Param('id') feedbackId: string,
    @Body() body: unknown,
  ) {
    return this.feedback.review(
      actor,
      parse(id, feedbackId),
      parse(feedbackReview, body),
    );
  }
}
