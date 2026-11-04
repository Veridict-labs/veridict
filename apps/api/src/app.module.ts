import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { PolicyModule } from './policy/policy.module';

@Module({
  imports: [DatabaseModule, AuthModule, KnowledgeModule, PolicyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
