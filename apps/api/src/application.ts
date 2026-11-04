import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ErrorsFilter } from './common/errors.filter';

export async function createApplication(logger: false | undefined = undefined) {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { logger, rawBody: true, abortOnError: false },
  );
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  app.use(
    (
      _req: unknown,
      res: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
  );
  app.useGlobalFilters(new ErrorsFilter());
  app.enableShutdownHooks();
  return app;
}
