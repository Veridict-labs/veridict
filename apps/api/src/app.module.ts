import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { PolicyModule } from './policy/policy.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { FeedbackModule } from './feedback/feedback.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    KnowledgeModule,
    PolicyModule,
    InquiriesModule,
    FeedbackModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
