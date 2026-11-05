import { Module } from '@nestjs/common';
import { EscalationsService } from './escalations.service';
import { EscalationsController } from './escalations.controller';

@Module({
  providers: [EscalationsService],
  controllers: [EscalationsController],
  exports: [EscalationsService],
})
export class EscalationsModule {}
