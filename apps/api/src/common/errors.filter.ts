import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorsFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: unknown = { error: 'INTERNAL_ERROR', message: 'Request could not be completed' };
    if (error instanceof HttpException) {
      status = error.getStatus();
      body = error.getResponse();
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003', 'P2025', 'P2034'].includes(error.code)) {
      status = 409;
      body = { error: 'CONFLICT', message: 'Resource conflict; refresh and retry' };
    } else {
      // Do not log query parameters, raw source text, or credentials.
      this.logger.error(`Unhandled request error: ${error instanceof Error ? error.constructor.name : 'Unknown'}`);
    }
    if (status === 404) body = { error: 'UNAVAILABLE', message: 'Resource unavailable' };
    response.status(status).json(body);
  }
}
