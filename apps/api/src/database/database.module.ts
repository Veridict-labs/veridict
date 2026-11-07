import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { Clock } from '../common/clock';

@Global()
@Module({ providers: [DatabaseService, Clock], exports: [DatabaseService, Clock] })
export class DatabaseModule {}
