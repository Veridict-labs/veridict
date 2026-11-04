import { Module } from '@nestjs/common';
import { PersonalDataController } from './personal-data.controller';
import { PersonalDataService } from './personal-data.service';

@Module({
  providers: [PersonalDataService],
  controllers: [PersonalDataController],
  exports: [PersonalDataService],
})
export class PersonalDataModule {}
