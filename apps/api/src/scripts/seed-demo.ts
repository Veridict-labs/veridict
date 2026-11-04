import 'dotenv/config';
import { createApplication } from '../application';
import { seedDemo } from '../demo/seed-demo';

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== 'true')
    throw new Error(
      'Set ALLOW_DEMO_SEED=true to create a synthetic demo organization',
    );
  const app = await createApplication(false);
  try {
    await app.init();
    const result = await seedDemo(app, {
      slug: process.env.DEMO_ORG_SLUG ?? 'veridict-demo',
      password: process.env.DEMO_PASSWORD ?? '',
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  console.error(
    'Demo seed failed. Check configuration and use an unused organization slug; existing data is never reset. A failed seed may leave its new demo organization partially populated.',
  );
  process.exitCode = 1;
});
