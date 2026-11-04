import 'dotenv/config';
import 'reflect-metadata';
import { createApplication } from './application';

async function bootstrap() {
  const app = await createApplication();
  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap().catch(() => { console.error('API startup failed. Check database connectivity and configuration.'); process.exitCode = 1; });
