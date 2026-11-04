import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, from, mergeMap, throwError } from 'rxjs';
import { DatabaseService } from '../database/database.service';
import { AuditService } from './audit.service';
import type { AuthRequest } from '../auth/actor';

@Injectable()
export class DenialInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DenialInterceptor.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    return next.handle().pipe(
      catchError((error) => {
        const actor = request.actor;
        if (
          !actor ||
          !(error instanceof HttpException) ||
          error.getStatus() < 400
        )
          return throwError(() => error);
        const record = this.db
          .$transaction((tx) =>
            this.audit.record(tx, actor, 'REQUEST_DENIED', [], 'DENIED', {
              status: error.getStatus(),
              method: request.method,
              route: String(request.route?.path ?? 'unknown'),
            }),
          )
          .catch(() => {
            this.logger.error('Could not record denied request');
          });
        return from(record).pipe(mergeMap(() => throwError(() => error)));
      }),
    );
  }
}
