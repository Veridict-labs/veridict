import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SecurityService } from './security.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { UsersController } from './users.controller';
import { AuditService } from '../audit/audit.service';
import { AuditController } from '../audit/audit.controller';
import { DenialInterceptor } from '../audit/denial.interceptor';

@Global()
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
  controllers: [AuthController, UsersController, AuditController],
  providers: [
    AuthService,
    SecurityService,
    AuditService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: DenialInterceptor },
  ],
  exports: [AuthService, SecurityService, AuditService],
})
export class AuthModule {}
