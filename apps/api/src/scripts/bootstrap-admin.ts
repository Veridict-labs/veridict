import 'dotenv/config';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { hashPassword } from '../auth/password';

async function main() {
  const config = z.object({
    BOOTSTRAP_EMAIL: z.email(), BOOTSTRAP_PASSWORD: z.string().min(12).max(256),
    BOOTSTRAP_ORG_SLUG: z.string().regex(/^[a-z0-9-]{1,80}$/),
  }).parse(process.env);
  const db = new DatabaseService();
  try {
    const passwordHash = await hashPassword(config.BOOTSTRAP_PASSWORD);
    await db.$transaction(async tx => {
      const organization = await tx.organization.create({ data: { slug: config.BOOTSTRAP_ORG_SLUG, name: config.BOOTSTRAP_ORG_SLUG } });
      const user = await tx.user.create({ data: { orgId: organization.id, email: config.BOOTSTRAP_EMAIL.toLowerCase(), name: 'Administrator', passwordHash, role: 'ADMIN', department: 'Administration' } });
      console.log(JSON.stringify({ org_id: organization.id, user_id: user.id }));
    });
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error('Bootstrap failed. Check configuration and ensure the organization slug is unused.'); process.exitCode = 1; });
