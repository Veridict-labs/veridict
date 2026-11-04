import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PolicyModule } from '../policy/policy.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { EscalationsModule } from '../escalations/escalations.module';

@Module({
  imports: [
    KnowledgeModule,
    PolicyModule,
    FeedbackModule,
    InquiriesModule,
    EscalationsModule,
  ],
  controllers: [McpController],
})
export class McpModule {}
