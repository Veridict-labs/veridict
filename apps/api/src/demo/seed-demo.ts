import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { z } from 'zod';
import {
  contextSchema,
  dataPurposes,
  ingestInput,
  personalDataKind,
  personalDataPurpose,
  role,
  policyInput,
  type IngestInput,
} from '@veridict/contracts';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PolicyService } from '../policy/policy.service';
import { EscalationsService } from '../escalations/escalations.service';
import { PersonalDataService } from '../personal-data/personal-data.service';

const key = z.string().min(1).max(80);
const fixtureSchema = z.object({
  version: z.literal(1),
  synthetic: z.literal(true),
  users: z
    .array(
      z.object({
        key,
        email: z.email(),
        name: key,
        role,
        department: key,
        review_domains: z.array(key),
      }),
    )
    .min(1),
  sources: z.array(
    z.object({
      key,
      visibility: z.enum(['ORGANIZATION', 'EXECUTIVE', 'EMPLOYEE']),
      supersedes_key: key.optional(),
      input: ingestInput,
      tagged_values: z
        .array(
          z.object({ field_type: personalDataKind, value: z.string().min(1) }),
        )
        .default([]),
    }),
  ),
  policies: z.array(
    z.object({
      key,
      source_key: key,
      supersedes_key: key.optional(),
      domain: key,
      predicate: contextSchema,
      result: z.string().min(1),
      authority: key,
      valid_from: z.iso.datetime(),
    }),
  ),
  precedents: z.object({
    source_key: key,
    domain: key,
    context: contextSchema,
    distribution: z.array(
      z.object({ authority: key, count: z.number().int().min(1).max(100) }),
    ),
  }),
  domain_owners: z.array(
    z.object({
      domain: key,
      owner_key: key,
      source_key: key,
      contact_email: z.email(),
    }),
  ),
  personal_data_grants: z.array(
    z.object({
      source_key: key,
      subject_key: key,
      field_type: personalDataKind,
      purpose: personalDataPurpose,
    }),
  ),
  scenarios: z.array(
    z.object({
      key,
      actor_key: key,
      question: z.string().min(1),
      expected: z.record(z.string(), z.unknown()),
      personal_data_request: z
        .object({
          source_key: key,
          field_type: personalDataKind,
          purpose: personalDataPurpose,
        })
        .optional(),
    }),
  ),
});

export async function seedDemo(
  app: INestApplication,
  config: { slug: string; password: string },
) {
  z.object({
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
    password: z.string().min(12).max(256),
  }).parse(config);
  const fixture = fixtureSchema.parse(
    JSON.parse(
      readFileSync(join(__dirname, '../../fixtures/demo.json'), 'utf8'),
    ),
  );
  const db = app.get(DatabaseService);
  const auth = app.get(AuthService);
  const knowledge = app.get(KnowledgeService);
  const policy = app.get(PolicyService);
  const escalations = app.get(EscalationsService);
  const privacy = app.get(PersonalDataService);
  const users = new Map(fixture.users.map((u) => [u.key, u]));
  const sourceKeys = new Set(fixture.sources.map((s) => s.key));
  if (
    users.size !== fixture.users.length ||
    sourceKeys.size !== fixture.sources.length ||
    users.get('admin')?.role !== 'ADMIN' ||
    !users.has('employee')
  )
    throw new Error('Invalid fixture aliases');
  for (const source of fixture.sources)
    for (const tag of source.tagged_values) {
      const content = source.input.content ?? '';
      const start = content.indexOf(tag.value);
      if (start < 0 || content.indexOf(tag.value, start + 1) >= 0)
        throw new Error(
          'Tagged fixture values must occur once in document content',
        );
    }
  const passwordHash = await hashPassword(config.password);
  // A unique slug rejects reruns; no existing organization is modified or reset.
  const organization = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { slug: config.slug, name: 'Veridict synthetic demo' },
    });
    for (const u of fixture.users)
      await tx.user.create({
        data: {
          orgId: org.id,
          email: u.email,
          name: u.name,
          role: u.role,
          department: u.department,
          reviewDomains: u.review_domains,
          passwordHash,
        },
      });
    return org;
  });
  const rows = await db.user.findMany({
    where: { orgId: organization.id },
    select: { id: true, email: true },
  });
  const userIds = Object.fromEntries(
    fixture.users.map((u) => [
      u.key,
      rows.find((r) => r.email === u.email)!.id,
    ]),
  );
  const session = await auth.login({
    org_slug: config.slug,
    email: users.get('admin')!.email,
    password: config.password,
  });
  const actor = await auth.authenticate(session.access_token);
  const sources: Record<
    string,
    { source_id: string; chunks: { chunk_id: string }[] }
  > = {};
  const claims: Record<string, string> = {};
  try {
    for (const source of fixture.sources) {
      const permissions: IngestInput['permissions'] =
        source.visibility === 'ORGANIZATION'
          ? [
              {
                subject_type: 'ORGANIZATION',
                subject_id: organization.id,
                action: 'READ',
              },
              {
                subject_type: 'USER',
                subject_id: userIds.reviewer,
                action: 'REVIEW',
              },
            ]
          : source.visibility === 'EXECUTIVE'
            ? [
                {
                  subject_type: 'DEPARTMENT',
                  subject_id: 'Executive',
                  action: 'READ',
                },
              ]
            : [
                {
                  subject_type: 'USER',
                  subject_id: userIds.employee,
                  action: 'READ',
                },
              ];
      const content = source.input.content ?? '';
      sources[source.key] = await knowledge.ingest(
        actor,
        ingestInput.parse({
          ...source.input,
          permissions,
          issuer_id: source.input.state === 'APPROVED' ? actor.id : undefined,
          supersedes_id: source.supersedes_key
            ? sources[source.supersedes_key].source_id
            : undefined,
          personal_data_annotations: source.tagged_values.map((t) => ({
            field_type: t.field_type,
            start: content.indexOf(t.value),
            end: content.indexOf(t.value) + t.value.length,
          })),
        }),
      );
    }
    for (const p of fixture.policies) {
      const result = await policy.create(
        actor,
        policyInput.parse({
          evidence_chunk_id: sources[p.source_key].chunks[0].chunk_id,
          domain: p.domain,
          predicate: p.predicate,
          result: p.result,
          authority: p.authority,
          valid_from: p.valid_from,
          supersedes_id: p.supersedes_key
            ? claims[p.supersedes_key]
            : undefined,
        }),
      );
      claims[p.key] = result.claim_id;
    }
    const historical = fixture.precedents;
    for (const group of historical.distribution)
      for (let i = 0; i < group.count; i++)
        await policy.createCase(actor, {
          domain: historical.domain,
          context: historical.context,
          outcome: 'Approved (synthetic fixture)',
          authority: group.authority,
          evidence_chunk_ids: [
            sources[historical.source_key].chunks[0].chunk_id,
          ],
        });
    for (const owner of fixture.domain_owners)
      await escalations.save(actor, owner.domain, {
        owner_id: userIds[owner.owner_key],
        evidence_chunk_id: sources[owner.source_key].chunks[0].chunk_id,
        contact_email: owner.contact_email,
      });
    for (const sourceKey of new Set(
      fixture.personal_data_grants.map((g) => g.source_key),
    ))
      await privacy.replaceGrants(
        actor,
        sources[sourceKey].source_id,
        fixture.personal_data_grants
          .filter((g) => g.source_key === sourceKey)
          .map((g) => ({
            field_type: g.field_type,
            purpose: g.purpose,
            subject_type: 'USER',
            subject_id: userIds[g.subject_key],
          })),
      );
    const scenarios = fixture.scenarios.map((s) => ({
      key: s.key,
      actor_key: s.actor_key,
      question: s.question,
      expected: s.expected,
      ...(s.personal_data_request
        ? {
            personal_data_request: {
              source_id: sources[s.personal_data_request.source_key].source_id,
              chunk_id:
                sources[s.personal_data_request.source_key].chunks[0].chunk_id,
              field_type: s.personal_data_request.field_type,
              purpose: dataPurposes[s.personal_data_request.field_type],
            },
          }
        : {}),
    }));
    return {
      synthetic: true,
      org_slug: config.slug,
      org_id: organization.id,
      users: fixture.users.map((u) => ({
        key: u.key,
        email: u.email,
        role: u.role,
        user_id: userIds[u.key],
      })),
      sources,
      claims,
      scenarios,
    };
  } finally {
    await auth.logout(actor);
  }
}
