import { Module } from '@nestjs/common';
import { InquiriesModule } from '../inquiries/inquiries.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PolicyModule } from '../policy/policy.module';
import { EscalationsModule } from '../escalations/escalations.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { HuggingFaceProvider } from './huggingface.provider';

@Module({
  imports: [InquiriesModule, KnowledgeModule, PolicyModule, EscalationsModule],
  controllers: [AgentController],
  providers: [AgentService, HuggingFaceProvider],
})
export class AgentModule {}
