import { DEMO_EVIDENCE, DEMO_FEEDBACK, DEMO_INQUIRIES } from './demo-data';
import type {
  Evidence,
  FeedbackAction,
  Inquiry,
  InquirySummary,
  Me,
  PendingFeedback,
  TraceEvent,
} from './types';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface VeridictClient {
  readonly mode: 'live' | 'demo';
  me(): Promise<Me>;
  listInquiries(): Promise<InquirySummary[]>;
  getInquiry(id: string): Promise<Inquiry>;
  /** Creates an inquiry and asks the agent to process it. Returns the inquiry id. */
  ask(question: string): Promise<string>;
  run(id: string): Promise<void>;
  trace(id: string): Promise<TraceEvent[]>;
  evidence(sourceId: string, chunkId: string): Promise<Evidence>;
  submitFeedback(input: {
    inquiry_id: string;
    domain: string;
    action: FeedbackAction;
    reason: string;
  }): Promise<void>;
  pendingFeedback(domain: string): Promise<PendingFeedback[]>;
  reviewFeedback(
    id: string,
    decision: 'VALIDATED' | 'REJECTED',
    reason: string,
  ): Promise<void>;
  logout(): Promise<void>;
}

export async function login(orgSlug: string, email: string, password: string) {
  const res = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ org_slug: orgSlug, email, password }),
  });
  if (!res.ok)
    throw new ApiError(
      res.status,
      res.status === 401
        ? 'Email, password or organization is incorrect.'
        : 'Sign-in failed.',
    );
  return (await res.json()) as { access_token: string; expires_at: string };
}

export function liveClient(token: string): VeridictClient {
  const call = async <T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ) => {
    const res = await fetch(`${API_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string | string[] };
        if (body.message)
          message = Array.isArray(body.message)
            ? body.message.join('; ')
            : body.message;
      } catch {}
      throw new ApiError(res.status, message);
    }
    return (await res.json()) as T;
  };
  return {
    mode: 'live',
    me: () => call<Me>('/v1/auth/me'),
    async listInquiries() {
      const page = await call<{ results: InquirySummary[] }>(
        '/v1/inquiries?limit=50',
      );
      return page.results;
    },
    getInquiry: (id) => call<Inquiry>(`/v1/inquiries/${id}`),
    async ask(question) {
      const created = await call<{ inquiry_id: string }>('/v1/inquiries', {
        method: 'POST',
        body: { question },
      });
      return created.inquiry_id;
    },
    async run(id) {
      await call(`/v1/inquiries/${id}/run`, { method: 'POST', body: {} });
    },
    async trace(id) {
      const page = await call<{ results: TraceEvent[] }>(
        `/v1/inquiries/${id}/trace?limit=100`,
      );
      return page.results;
    },
    evidence: (sourceId, chunkId) =>
      call<Evidence>(
        `/v1/sources/${sourceId}/evidence?chunk_id=${encodeURIComponent(chunkId)}`,
      ),
    async submitFeedback(input) {
      await call('/v1/feedback', { method: 'POST', body: input });
    },
    async pendingFeedback(domain) {
      const page = await call<{ results: PendingFeedback[] }>(
        `/v1/feedback?domain=${encodeURIComponent(domain)}`,
      );
      return page.results.map((r) => ({ ...r, domain }));
    },
    async reviewFeedback(id, decision, reason) {
      await call(`/v1/feedback/${id}/validate`, {
        method: 'POST',
        body: { decision, reason },
      });
    },
    async logout() {
      await call('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Offline client backed by labeled synthetic fixtures. Nothing is sent anywhere. */
export function demoClient(): VeridictClient {
  const inquiries = new Map(
    DEMO_INQUIRIES.map((i) => [i.inquiry_id, structuredClone(i)]),
  );
  let feedback = structuredClone(DEMO_FEEDBACK);
  const pending = new Set<string>();
  let counter = 0;

  const pick = (q: string) => {
    const s = q.toLowerCase();
    if (/kenari/.test(s)) return 'demo-kenari';
    if (/saas|renewal|approver|approval/.test(s)) return 'demo-saas';
    if (/summary|ringkas|onboarding|klaim|claim|form/.test(s))
      return 'demo-onboarding';
    if (/bensin|fuel|tunjangan/.test(s)) return 'demo-fuel';
    return 'demo-missing';
  };

  return {
    mode: 'demo',
    async me() {
      return {
        id: 'demo-user',
        org_id: 'demo-org',
        role: 'REVIEWER',
        department: 'HR',
        review_domains: ['fuel', 'procurement'],
        name: 'Demo Reviewer',
      };
    },
    async listInquiries() {
      return [...inquiries.values()].map((i) => ({
        inquiry_id: i.inquiry_id,
        status: pending.has(i.inquiry_id) ? 'PENDING' : i.status,
        created_at: i.created_at,
        question: i.question,
      }));
    },
    async getInquiry(id) {
      const found = inquiries.get(id);
      if (!found) throw new ApiError(404, 'Not found');
      if (pending.has(id))
        return {
          ...found,
          status: 'PENDING',
          answer: null,
          citations: [],
          official_truth: null,
          operational_truth: null,
          conflicts: [],
          decision_trail: [],
        };
      return structuredClone(found);
    },
    async ask(question) {
      const template = inquiries.get(pick(question))!;
      const id = `demo-new-${++counter}`;
      const now = new Date().toISOString();
      inquiries.set(id, {
        ...structuredClone(template),
        inquiry_id: id,
        question,
        created_at: now,
        updated_at: now,
      });
      pending.add(id);
      return id;
    },
    async run(id) {
      await wait(2600);
      pending.delete(id);
    },
    async trace(id) {
      const i = inquiries.get(id);
      if (!i) return [];
      const t = (s: number) =>
        new Date(new Date(i.created_at).getTime() + s * 1000).toISOString();
      const refs = i.citations.map((c) => c.chunk_id);
      const events: TraceEvent[] = [
        {
          event_id: `${id}-1`,
          event_type: 'INQUIRY_CREATED',
          tool_call_id: null,
          decision: 'PENDING',
          resource_refs: [id],
          metadata: null,
          created_at: t(0),
        },
        {
          event_id: `${id}-2`,
          event_type: 'TOOL_search_authorized_knowledge',
          tool_call_id: 'call_1',
          decision: 'ALLOWED',
          resource_refs: refs,
          metadata: { results: refs.length },
          created_at: t(3),
        },
      ];
      if (i.official_truth)
        events.push({
          event_id: `${id}-3`,
          event_type: 'TOOL_resolve_policy_claims',
          tool_call_id: 'call_2',
          decision: 'ALLOWED',
          resource_refs: refs.slice(0, 1),
          metadata: null,
          created_at: t(7),
        });
      if (i.operational_truth)
        events.push({
          event_id: `${id}-4`,
          event_type: 'TOOL_reconcile_truth',
          tool_call_id: 'call_3',
          decision: 'ALLOWED',
          resource_refs: refs,
          metadata: null,
          created_at: t(11),
        });
      events.push({
        event_id: `${id}-5`,
        event_type: 'INQUIRY_ANSWERED',
        tool_call_id: null,
        decision: i.status,
        resource_refs: refs,
        metadata: null,
        created_at: t(15),
      });
      return events;
    },
    async evidence(sourceId, chunkId) {
      await wait(250);
      const e = Object.values(DEMO_EVIDENCE).find(
        (x) => x.source_id === sourceId && x.chunk_id === chunkId,
      );
      if (!e) throw new ApiError(404, 'Not found');
      return e;
    },
    async submitFeedback(input) {
      await wait(300);
      feedback.push({
        feedback_id: `demo-fb-${Date.now()}`,
        inquiry_id: input.inquiry_id,
        domain: input.domain,
        action: input.action,
        reason: input.reason,
        created_at: new Date().toISOString(),
        question: inquiries.get(input.inquiry_id)?.question,
      });
    },
    async pendingFeedback(domain) {
      return feedback.filter((f) => f.domain === domain);
    },
    async reviewFeedback(id) {
      await wait(300);
      feedback = feedback.filter((f) => f.feedback_id !== id);
    },
    async logout() {},
  };
}
