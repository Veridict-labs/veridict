import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [InquiriesModule, PolicyModule],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
