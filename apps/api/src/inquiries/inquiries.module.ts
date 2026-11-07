import { Module } from '@nestjs/common';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { EscalationsModule } from '../escalations/escalations.module';
import { PersonalDataModule } from '../personal-data/personal-data.module';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [EscalationsModule, PersonalDataModule, PolicyModule],
  controllers: [InquiriesController],
  providers: [InquiriesService],
  exports: [InquiriesService],
})
export class InquiriesModule {}
