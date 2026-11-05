import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type {
  IngestInput,
  PermissionInput,
  SearchInput,
} from '@veridict/contracts';
import type { Actor } from '../auth/actor';
import { SecurityService } from '../auth/security.service';
import { AuditService, digest } from '../audit/audit.service';
import { evidence, maskPII, normalize, splitContent } from './content';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly security: SecurityService,
    private readonly audit: AuditService,
  ) {}

  private async validatePermissions(
    tx: Prisma.TransactionClient,
    actor: Actor,
    permissions: PermissionInput[],
  ) {
    for (const p of permissions) {
      if (p.subject_type === 'ORGANIZATION' && p.subject_id !== actor.orgId)
        throw new BadRequestException('Invalid permission subject');
      if (
        p.subject_type === 'USER' &&
        !(await tx.user.findFirst({
          where: { id: p.subject_id, orgId: actor.orgId },
        }))
      )
        throw new BadRequestException('Invalid permission subject');
    }
  }

  ingest(actor: Actor, input: IngestInput) {
    return this.security.scope(actor, true, async (tx) => {
      this.security.requireAdmin(actor);
      await this.validatePermissions(tx, actor, input.permissions);
      if (input.issuer_id) {
        const issuer = await tx.user.findFirst({
          where: { id: input.issuer_id, orgId: actor.orgId, active: true },
        });
        if (
          !issuer ||
          (input.state === 'APPROVED' && issuer.role === 'EMPLOYEE')
        )
          throw new BadRequestException('Invalid issuer authority');
      } else if (input.state === 'APPROVED')
        throw new BadRequestException(
          'Approved sources require an authorized issuer',
        );
      if (input.supersedes_id) {
        const previous = await tx.knowledgeSource.findFirst({
          where: { id: input.supersedes_id, orgId: actor.orgId },
        });
        if (
          !previous ||
          input.version !== previous.version + 1 ||
          input.state !== 'APPROVED' ||
          !input.valid_from ||
          (previous.validFrom &&
            new Date(input.valid_from) < previous.validFrom)
        )
          throw new BadRequestException('Invalid source version chain');
      }
      const chunks = splitContent(normalize(input));
      const annotations = input.personal_data_annotations;
      const sorted = [...annotations].sort((a, b) => a.start - b.start);
      if (
        sorted.some(
          (a, i) =>
            a.end > normalize(input).length ||
            (i > 0 && a.start < sorted[i - 1].end),
        )
      )
        throw new BadRequestException(
          'Personal-data annotations must be in bounds and non-overlapping',
        );
      const chunkAnnotations = (chunk: (typeof chunks)[number]) =>
        annotations
          .filter((a) => a.start < chunk.spanEnd && a.end > chunk.spanStart)
          .map((a) => ({
            field_type: a.field_type,
            start: Math.max(a.start, chunk.spanStart) - chunk.spanStart,
            end: Math.min(a.end, chunk.spanEnd) - chunk.spanStart,
            complete: a.start >= chunk.spanStart && a.end <= chunk.spanEnd,
          }));
      if (
        input.embeddings &&
        (input.embeddings.length !== chunks.length ||
          new Set(input.embeddings.map((e) => e.length)).size !== 1)
      )
        throw new BadRequestException(
          'Provide one embedding of equal dimensions per normalized chunk',
        );
      const source = await tx.knowledgeSource.create({
        data: {
          orgId: actor.orgId,
          ownerId: actor.id,
          type: input.type,
          title: input.title,
          externalId: input.external_id,
          state: input.state,
          issuerId: input.issuer_id,
          validFrom: input.valid_from,
          validUntil: input.valid_until,
          version: input.version,
          supersedesId: input.supersedes_id,
          embeddingModel: input.embedding_model,
          permissions: {
            createMany: {
              data: [
                { subjectType: 'USER', subjectId: actor.id, action: 'READ' },
                { subjectType: 'USER', subjectId: actor.id, action: 'REVIEW' },
                ...input.permissions.map((p) => ({
                  subjectType: p.subject_type,
                  subjectId: p.subject_id,
                  action: p.action,
                })),
              ],
              skipDuplicates: true,
            },
          },
        },
      });
      const result: {
        chunk_id: string;
        chunk_index: number;
        span_start: number;
        span_end: number;
      }[] = [];
      for (const chunk of chunks) {
        const vector = input.embeddings?.[chunk.chunkIndex];
        const saved = await tx.sourceChunk.create({
          data: {
            ...chunk,
            sourceId: source.id,
            personalDataSpans: chunkAnnotations(chunk),
            embeddingDims: vector?.length,
          },
        });
        if (vector)
          await tx.$executeRaw`UPDATE "SourceChunk" SET embedding = ${JSON.stringify(vector)}::vector WHERE id = ${saved.id}::uuid`;
        result.push({
          chunk_id: saved.id,
          chunk_index: chunk.chunkIndex,
          span_start: chunk.spanStart,
          span_end: chunk.spanEnd,
        });
      }
      if (input.supersedes_id && new Date(input.valid_from!) <= new Date()) {
        await tx.inquiry.updateMany({
          where: {
            orgId: actor.orgId,
            evidence: { some: { chunk: { sourceId: input.supersedes_id } } },
          },
          data: { status: 'NEEDS_REVALIDATION' },
        });
      }
      await this.security.bump(tx, actor);
      await this.audit.record(
        tx,
        actor,
        'SOURCE_INGESTED',
        [source.id],
        'ALLOWED',
        { type: source.type, chunk_count: chunks.length },
      );
      return { source_id: source.id, chunks: result };
    });
  }

  preview(actor: Actor, input: IngestInput) {
    return this.security.scope(actor, false, async (tx) => {
      this.security.requireAdmin(actor);
      const chunks = splitContent(normalize(input));
      if (
        input.personal_data_annotations.some(
          (a) => a.end > normalize(input).length,
        )
      )
        throw new BadRequestException(
          'Personal-data annotation is outside the content',
        );
      await this.audit.record(tx, actor, 'INGESTION_PREVIEWED', [], 'ALLOWED', {
        chunk_count: chunks.length,
      });
      return {
        chunks: chunks.map((c) => ({
          chunk_index: c.chunkIndex,
          content: maskPII(
            c.content,
            [],
            input.personal_data_annotations
              .filter((a) => a.start < c.spanEnd && a.end > c.spanStart)
              .map((a) => ({
                field_type: a.field_type,
                start: Math.max(a.start, c.spanStart) - c.spanStart,
                end: Math.min(a.end, c.spanEnd) - c.spanStart,
                complete: a.start >= c.spanStart && a.end <= c.spanEnd,
              })),
          ),
          span_start: c.spanStart,
          span_end: c.spanEnd,
          integrity_hash: c.integrityHash,
        })),
      };
    });
  }

  replacePermissions(
    actor: Actor,
    sourceId: string,
    permissions: PermissionInput[],
  ) {
    return this.security.scope(actor, true, async (tx) => {
      this.security.requireAdmin(actor);
      const source = await tx.knowledgeSource.findFirst({
        where: { id: sourceId, orgId: actor.orgId },
        select: { id: true },
      });
      if (!source) throw new NotFoundException();
      await this.validatePermissions(tx, actor, permissions);
      await tx.permission.deleteMany({ where: { sourceId } });
      await tx.permission.createMany({
        data: permissions.map((p) => ({
          sourceId,
          subjectType: p.subject_type,
          subjectId: p.subject_id,
          action: p.action,
        })),
        skipDuplicates: true,
      });
      await this.security.bump(tx, actor);
      await this.audit.record(tx, actor, 'PERMISSIONS_REPLACED', [sourceId]);
      return { updated: true };
    });
  }

  search(actor: Actor, input: SearchInput) {
    return this.security.scope(actor, false, async (tx) => {
      const types = input.source_types?.length
        ? Prisma.sql`AND s.type::text IN (${Prisma.join(input.source_types)})`
        : Prisma.empty;
      const semantic = input.embedding
        ? Prisma.sql`
        SELECT id, row_number() OVER (ORDER BY distance, id) AS rank FROM (
          SELECT id, embedding <=> ${JSON.stringify(input.embedding)}::vector AS distance
          FROM allowed WHERE embedding IS NOT NULL AND "embeddingDims" = ${input.embedding.length}
            AND "embeddingModel" = ${input.embedding_model}
        ) distances WHERE distance <= 0.8 ORDER BY distance, id LIMIT 100
      `
        : Prisma.sql`SELECT id, 1::bigint AS rank FROM allowed WHERE false`;
      const results = await tx.$queryRaw<
        { id: string; score: number }[]
      >(Prisma.sql`
        WITH allowed AS MATERIALIZED (
          SELECT c.*, s."embeddingModel" FROM "SourceChunk" c JOIN "KnowledgeSource" s ON s.id = c."sourceId"
          WHERE s."orgId" = ${actor.orgId}::uuid ${types}
          AND EXISTS (SELECT 1 FROM "Permission" p WHERE p."sourceId" = s.id AND p.action = 'READ'
            AND ((p."subjectType" = 'USER' AND p."subjectId" = ${actor.id})
              OR (p."subjectType" = 'DEPARTMENT' AND p."subjectId" = ${actor.department})
              OR (p."subjectType" = 'ORGANIZATION' AND p."subjectId" = ${actor.orgId})))
        ), lexical AS (
          SELECT id, row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('simple', content), websearch_to_tsquery('simple', ${input.query})) DESC, id) AS rank
          FROM allowed WHERE to_tsvector('simple', content) @@ websearch_to_tsquery('simple', ${input.query})
          LIMIT 100
        ), semantic AS (${semantic}), scores AS (
          SELECT id, 1.0 / (60 + rank) AS score FROM lexical
          UNION ALL SELECT id, 1.0 / (60 + rank) AS score FROM semantic
        ) SELECT id, sum(score)::double precision AS score FROM scores GROUP BY id ORDER BY score DESC, id LIMIT ${input.limit}
      `);
      const chunks = await this.security.chunks(
        tx,
        actor,
        results.map((r) => r.id),
      );
      const byId = new Map(chunks.map((c) => [c.id, c]));
      await this.audit.record(
        tx,
        actor,
        'KNOWLEDGE_SEARCH',
        chunks.map((c) => c.sourceId),
        'ALLOWED',
        {
          query_hash: digest(input.query),
          result_count: results.length,
          mode: input.embedding ? 'HYBRID' : 'LEXICAL',
        },
      );
      return {
        results: results.map((r) => ({
          ...evidence(byId.get(r.id)!),
          retrieval_score: r.score,
        })),
        mode: input.embedding ? 'HYBRID' : 'LEXICAL',
      };
    });
  }

  getEvidence(actor: Actor, sourceId: string, chunkId: string) {
    return this.security.scope(actor, false, async (tx) => {
      const [chunk] = await this.security.chunks(tx, actor, [chunkId]);
      if (chunk.sourceId !== sourceId) throw new NotFoundException();
      await this.audit.record(tx, actor, 'EVIDENCE_OPENED', [
        sourceId,
        chunkId,
      ]);
      return evidence(chunk);
    });
  }
}
