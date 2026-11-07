import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AgentError,
  runGroundedAgent,
  type Citation,
  type ReadToolName,
} from '@veridict/agent';
import {
  evidenceInput,
  escalationInput,
  precedentInput,
  reconcileInput,
  resolveInput,
  searchInput,
} from '@veridict/contracts';
import { parse } from '../common/validation';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../auth/security.service';
import type { Actor } from '../auth/actor';
import { InquiriesService } from '../inquiries/inquiries.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { evidence } from '../knowledge/content';
import { PolicyService } from '../policy/policy.service';
import { EscalationsService } from '../escalations/escalations.service';
import { AuditService, digest } from '../audit/audit.service';
import { ModelProvider } from './model.provider';
import { Clock } from '../common/clock';
import { noAiAnswer, noAiQuery } from './no-ai';

@Injectable()
export class AgentService {
  private readonly active = new Set<string>();
  private readonly logger = new Logger(AgentService.name);
  constructor(
    private readonly provider: ModelProvider,
    private readonly auth: AuthService,
    private readonly security: SecurityService,
    private readonly inquiries: InquiriesService,
    private readonly knowledge: KnowledgeService,
    private readonly policy: PolicyService,
    private readonly escalations: EscalationsService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async run(user: Actor, inquiryId: string) {
    if (user.sessionKind !== 'USER') throw new ForbiddenException();
    const runKey = `${user.orgId}:${inquiryId}`;
    if (this.active.has(runKey))
      throw new ConflictException('Inquiry is already being processed');
    if (this.active.size >= 4)
      throw new ServiceUnavailableException({
        error: 'AI_BUSY',
        message: 'Try again later',
      });
    this.active.add(runKey);
    let agent: Actor | undefined;
    let withoutAi = false;
    try {
      const inquiry = await this.inquiries.get(user, inquiryId);
      withoutAi = inquiry.processing_mode === 'no_ai';
      if (!['PENDING', 'NEEDS_REVALIDATION'].includes(inquiry.status))
        throw new ConflictException('Inquiry already completed');
      if (inquiry.personal_data_request)
        return await this.inquiries.completePersonalData(
          { ...user, toolCallId: randomUUID() },
          inquiryId,
        );
      const session = await this.auth.issueToolToken(user, inquiryId);
      agent = await this.auth.authenticate(session.access_token);
      const actor = agent;
      if (withoutAi)
        return await this.runWithoutAi(actor, inquiryId, inquiry.question);
      const { provider, model, modelId } = this.provider.create();
      await this.security.scope(actor, false, (tx) =>
        this.audit.record(tx, actor, 'AI_RUN_STARTED', [], 'STARTED', {
          provider,
          model: modelId,
        }),
      );
      const result = await runGroundedAgent({
        model,
        question: inquiry.question,
        referenceTime: this.clock.now().toISOString(),
        execute: async (name, args) => {
          const invocation = { ...actor, toolCallId: randomUUID() };
          await this.security.scope(invocation, false, (tx) =>
            this.audit.record(
              tx,
              invocation,
              'AI_TOOL_STARTED',
              [],
              'STARTED',
              { tool: name },
            ),
          );
          try {
            const value = await this.execute(invocation, name, args);
            await this.security.scope(invocation, false, (tx) =>
              this.audit.record(
                tx,
                invocation,
                'AI_TOOL_COMPLETED',
                [],
                'ALLOWED',
                { tool: name, result_hash: digest(JSON.stringify(value)) },
              ),
            );
            return value;
          } catch (error) {
            // Revoked identity/evidence aborts the run; do not send cached context again.
            await this.security
              .scope(invocation, false, (tx) =>
                this.audit.record(
                  tx,
                  invocation,
                  'AI_TOOL_DENIED',
                  [],
                  'UNAVAILABLE',
                  { tool: name },
                ),
              )
              .catch(() => {});
            throw error;
          }
        },
        reauthorize: (citations) => this.reauthorize(actor, citations),
      });
      const completed = await this.inquiries.answer(
        actor,
        inquiryId,
        result.answer,
        result.observedEvidence,
        result.policyChecks,
      );
      await this.security
        .scope(actor, false, (tx) =>
          this.audit.record(
            tx,
            actor,
            'AI_RUN_COMPLETED',
            [inquiryId],
            completed.status,
            {
              provider,
              model: modelId,
              model_calls: result.modelCalls,
              grounding_reason: result.groundingReason,
              policy_checks: result.policyChecks.length,
            },
          ),
        )
        .catch(() =>
          this.logger.error('Could not record agent completion summary'),
        );
      return {
        ...completed,
        provider,
        model: modelId,
        model_calls: result.modelCalls,
      };
    } catch (error) {
      if (agent) {
        await this.security
          .scope(agent, false, (tx) =>
            this.audit.record(
              tx,
              agent!,
              withoutAi ? 'NO_AI_RUN_FAILED' : 'AI_RUN_FAILED',
              [inquiryId],
              'FAILED',
              {
                error: error instanceof AgentError ? error.code : 'UNAVAILABLE',
              },
            ),
          )
          .catch(() => {});
      }
      if (error instanceof AgentError) {
        const status = error.code === 'AI_RATE_LIMITED' ? 429 : 503;
        throw new HttpException(
          {
            error: error.code,
            message: 'AI processing could not be completed',
          },
          status,
        );
      }
      throw error;
    } finally {
      if (agent)
        await this.auth.releaseToolSession(agent).catch(() => {
          this.logger.error('Could not release temporary agent session');
        });
      this.active.delete(runKey);
    }
  }

  private async runWithoutAi(actor: Actor, inquiryId: string, question: string) {
    await this.security.scope(actor, false, (tx) =>
      this.audit.record(tx, actor, 'NO_AI_RUN_STARTED', [inquiryId], 'STARTED', {
        model_calls: 0,
      }),
    );
    const query = noAiQuery(question);
    const search = query
      ? await this.knowledge.search(
          { ...actor, toolCallId: randomUUID() },
          { query, limit: 5 },
        )
      : { results: [] };
    await this.reauthorize(actor, search.results);
    const completed = await this.inquiries.answer(
      actor,
      inquiryId,
      noAiAnswer(question, search.results),
      search.results,
    );
    await this.security
      .scope(actor, false, (tx) =>
        this.audit.record(
          tx, actor, 'NO_AI_RUN_COMPLETED', [inquiryId], completed.status,
          { model_calls: 0, result_count: search.results.length, retrieval: 'LEXICAL' },
        ),
      )
      .catch(() => this.logger.error('Could not record source search completion summary'));
    return {
      ...completed,
      processing_mode: 'no_ai',
      provider: null,
      model: null,
      model_calls: 0,
    };
  }

  private reauthorize(
    actor: Actor,
    citations: (Citation & { excerpt?: string; policy_domains?: string[] })[],
  ) {
    return this.security.scope(actor, false, async (tx) => {
      const chunks = await this.security.chunks(
        tx,
        actor,
        citations.map((c) => c.chunk_id),
      );
      for (const citation of citations) {
        const chunk = chunks.find(
          (c) =>
            c.id === citation.chunk_id && c.sourceId === citation.source_id,
        );
        if (
          !chunk ||
          (citation.excerpt !== undefined &&
            evidence(chunk).excerpt !== citation.excerpt) ||
          (citation.policy_domains !== undefined &&
            JSON.stringify(evidence(chunk).policy_domains) !== JSON.stringify(citation.policy_domains))
        )
          throw new NotFoundException();
      }
    });
  }

  private async execute(
    actor: Actor,
    name: ReadToolName,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case 'search_authorized_knowledge':
        return this.knowledge.search(actor, parse(searchInput, args));
      case 'resolve_policy_claims':
        return this.policy.resolve(actor, parse(resolveInput, args));
      case 'find_validated_precedents':
        return this.policy.precedents(actor, parse(precedentInput, args));
      case 'reconcile_truth':
        return this.policy.reconcile(actor, parse(reconcileInput, args));
      case 'get_evidence': {
        const input = parse(evidenceInput, args);
        return this.knowledge.getEvidence(
          actor,
          input.source_id,
          input.chunk_id,
        );
      }
      case 'resolve_domain_owner': {
        const result = await this.escalations.resolve(
          actor,
          parse(escalationInput, args).domain,
        );
        return result.evidence
          ? {
              ...result,
              evidence: await this.knowledge.getEvidence(
                actor,
                result.evidence.source_id,
                result.evidence.chunk_id,
              ),
            }
          : result;
      }
    }
  }
}
