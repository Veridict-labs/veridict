'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RUN_FLAG } from '@/components/AskBox';
import { EvidenceDrawer } from '@/components/EvidenceDrawer';
import { Icon } from '@/components/Icon';
import {
  Button,
  Disclosure,
  Pill,
  SourceStatePill,
  SourceTypeLabel,
  StatusBadge,
  StepTracker,
  cx,
  formatDate,
  type Step,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import type {
  Citation,
  FeedbackAction,
  Inquiry,
  Statement,
  TraceEvent,
} from '@/lib/types';

export default function InquiryPage() {
  const { id } = useParams<{ id: string }>();
  const { client } = useSession();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const running = runningId === id;
  const [open, setOpen] = useState<Citation | null>(null);
  const started = useRef<{ id: string; client: typeof client } | null>(null);
  const active = useRef<{ id: string; client: typeof client } | null>(null);

  const load = useCallback(async (preserveError = false) => {
    if (!client) return false;
    try {
      const next = await client.getInquiry(id);
      if (active.current?.id !== id || active.current.client !== client) return false;
      setInquiry(next);
      setOpen(null);
      if (!preserveError) setError(null);
      return true;
    } catch (e) {
      if (active.current?.id !== id || active.current.client !== client) return false;
      setInquiry(null);
      setOpen(null);
      setError(
        e instanceof ApiError && e.status === 404
          ? 'This question is not available.'
          : 'Could not load this question.',
      );
      return false;
    }
  }, [client, id]);

  const run = useCallback(async () => {
    if (!client) return;
    setRunningId(id);
    setError(null);
    try {
      await client.run(id);
    } catch (e) {
      if (active.current?.id !== id || active.current.client !== client) return;
      setError(
        e instanceof ApiError && e.status === 429
          ? 'The AI provider is rate-limited right now. Try again in a minute.'
          : e instanceof Error
            ? e.message
            : 'The agent could not finish.',
      );
    } finally {
      setRunningId((current) => current === id ? null : current);
      await load(true);
    }
  }, [client, id, load]);

  useEffect(() => {
    active.current = { id, client };
    if (!client || (started.current?.id === id && started.current.client === client)) return;
    started.current = { id, client };
    let shouldRun = false;
    try {
      shouldRun = sessionStorage.getItem(RUN_FLAG(id)) === '1';
      sessionStorage.removeItem(RUN_FLAG(id));
    } catch {}
    void load().then((loaded) => {
      if (loaded && shouldRun) void run();
    });
  }, [client, id, load, run]);

  const closeDrawer = useCallback(() => setOpen(null), []);

  if (!inquiry || inquiry.inquiry_id !== id)
    return (
      <div className="mx-auto max-w-4xl">
        <Breadcrumb />
        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-risk-soft px-4 py-3 text-risk"
          >
            {error}
          </p>
        ) : (
          <p className="vd-pulse mt-6 text-ink-3">Loading…</p>
        )}
      </div>
    );

  const status = running ? 'PENDING' : inquiry.status;
  const numbered = (c: Citation) =>
    inquiry.citations.findIndex((e) => e.chunk_id === c.chunk_id) + 1;

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb />

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-sm text-ink-3">
            Asked {formatDate(inquiry.created_at, true)}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
          {inquiry.question}
        </h1>
      </header>

      <div className="mt-8 rounded-2xl border border-line bg-surface px-3 py-5 sm:px-6">
        <StepTracker steps={steps(inquiry, running)} />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-xl bg-risk-soft px-4 py-3 text-sm text-risk"
        >
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <Outcome
        inquiry={inquiry}
        status={status}
        onRun={run}
        onCite={setOpen}
        numbered={numbered}
      />

      {status === 'ANSWERED' &&
        (inquiry.official_truth ||
          inquiry.operational_truth ||
          inquiry.conflicts.length > 0) && (
          <Reconciliation
            inquiry={inquiry}
            onCite={setOpen}
            numbered={numbered}
          />
        )}

      {status !== 'PENDING' && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold tracking-tight">
              Check before you rely on it
            </h2>
            <span className="text-sm text-ink-3">
              Every source re-checks your access when opened
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <Disclosure
              icon="doc"
              eyebrow="Which sources were used?"
              title={
                inquiry.citations.length
                  ? `${plural(inquiry.citations.length, 'cited source')}`
                  : 'No sources cited'
              }
              defaultOpen={inquiry.citations.length > 0}
            >
              {inquiry.citations.length === 0 ? (
                <p className="text-sm text-ink-2">
                  No source you can access supports an answer, so none is cited.
                </p>
              ) : (
                <ul className="space-y-2">
                  {inquiry.citations.map((c, i) => (
                    <li key={c.chunk_id}>
                      <button
                        type="button"
                        onClick={() => setOpen(c)}
                        className="flex w-full items-start gap-3 rounded-xl border border-line p-3 text-left hover:border-brand hover:bg-brand-soft/40"
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-strong">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{c.title}</span>
                            <SourceStatePill state={c.source_state} />
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-ink-2">
                            “{c.excerpt}”
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                            <SourceTypeLabel type={c.source_type} />
                            {c.valid_from && (
                              <span>Valid from {formatDate(c.valid_from)}</span>
                            )}
                            {c.valid_until && (
                              <span>until {formatDate(c.valid_until)}</span>
                            )}
                          </span>
                        </span>
                        <Icon
                          name="external"
                          size={15}
                          className="mt-1 shrink-0 text-ink-3"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Disclosure>

            <Disclosure
              icon="scale"
              eyebrow="How did it decide?"
              title={
                inquiry.decision_trail.length
                  ? plural(inquiry.decision_trail.length, 'reasoning step')
                  : 'No decision steps recorded'
              }
            >
              {inquiry.decision_trail.length === 0 ? (
                <p className="text-sm text-ink-2">
                  No decision steps were recorded for this answer.
                </p>
              ) : (
                <ol className="space-y-3">
                  {inquiry.decision_trail.map((n, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong text-xs font-bold text-ink-2">
                        {i + 1}
                      </span>
                      <div>
                        <p className="leading-relaxed">{n.label}</p>
                        <CiteChips
                          evidence={n.evidence}
                          onCite={setOpen}
                          numbered={numbered}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Disclosure>

            <Disclosure
              icon="info"
              eyebrow="Assumptions and limits"
              title={`${plural(inquiry.assumptions.length, 'assumption')} · ${plural(inquiry.limitations.length, 'limitation')}`}
            >
              <TextList
                title="Assumed"
                items={inquiry.assumptions}
                empty="No assumptions were needed."
              />
              <div className="h-4" />
              <TextList
                title="Limitations"
                items={inquiry.limitations}
                empty="No limitations recorded."
              />
            </Disclosure>

            <TraceDisclosure id={inquiry.inquiry_id} />
          </div>
        </section>
      )}

      {status === 'ANSWERED' && <Feedback inquiry={inquiry} />}

      <EvidenceDrawer
        key={open?.chunk_id ?? 'closed'}
        citation={open}
        onClose={closeDrawer}
      />
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <Link
        href="/console"
        className="text-brand-strong underline underline-offset-4"
      >
        Home
      </Link>
      <span className="text-ink-3"> › Question</span>
    </nav>
  );
}

function steps(i: Inquiry, running: boolean): Step[] {
  const n = i.citations.length;
  if (running || i.status === 'PENDING')
    return [
      { label: 'Asked', detail: 'Question saved', icon: 'ask', state: 'done' },
      {
        label: 'Permissions',
        detail: running ? 'Filtering sources' : 'Waiting for agent',
        icon: 'lock',
        state: running ? 'active' : 'todo',
      },
      { label: 'Sources', detail: '—', icon: 'search', state: 'todo' },
      { label: 'Rule check', detail: '—', icon: 'scale', state: 'todo' },
      { label: 'Answer', detail: '—', icon: 'check', state: 'todo' },
    ];
  const answered = i.status === 'ANSWERED';
  return [
    { label: 'Asked', detail: 'Question saved', icon: 'ask', state: 'done' },
    {
      label: 'Permissions',
      detail: 'Applied first',
      icon: 'lock',
      state: 'done',
    },
    {
      label: 'Sources',
      detail: n ? `${n} cited` : 'None usable',
      icon: 'search',
      state: 'done',
    },
    {
      label: 'Rule check',
      detail: i.conflicts.length
        ? `${i.conflicts.length} conflict resolved`
        : answered
          ? 'No conflict'
          : 'Skipped',
      icon: 'scale',
      state: answered ? 'done' : 'skipped',
    },
    {
      label: 'Answer',
      detail:
        i.status === 'NEEDS_REVALIDATION'
          ? 'Out of date'
          : answered
            ? 'Every claim cited'
            : i.status === 'NEEDS_CLARIFICATION'
              ? 'Needs detail'
              : 'Abstained safely',
      icon: 'check',
      state: i.status === 'NEEDS_REVALIDATION' ? 'skipped' : 'done',
    },
  ];
}

function Outcome({
  inquiry,
  status,
  onRun,
  onCite,
  numbered,
}: {
  inquiry: Inquiry;
  status: Inquiry['status'];
  onRun(): void;
  onCite(c: Citation): void;
  numbered(c: Citation): number;
}) {
  const router = useRouter();
  const { client } = useSession();
  const askAgain = async () => {
    if (!client) return;
    const id = await client.ask(inquiry.question, inquiry.personal_data_request ?? undefined);
    try {
      sessionStorage.setItem(RUN_FLAG(id), '1');
    } catch {}
    router.push(`/console/inquiry/${id}`);
  };

  if (status === 'PENDING')
    return (
      <Card tone="info" icon="clock" title="Veridict is working on it">
        <p className="text-ink-2">
          Searching only the sources you can access, then checking which rule
          applies. Nothing is shown until every claim is matched to a citation.
        </p>
        {!inquiry.answer && (
          <Button variant="outline" className="mt-4" onClick={onRun}>
            <Icon name="refresh" size={15} />
            Start processing
          </Button>
        )}
      </Card>
    );

  if (status === 'ANSWERED') {
    const headline = inquiry.official_truth?.statement;
    return (
      <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ok-soft text-ok">
            <Icon name="check" size={24} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ok">
              Answer supported by {plural(inquiry.citations.length, 'source')}
            </p>
            {headline && (
              <p className="mt-1 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
                {headline}
              </p>
            )}
            <p
              className={cx(
                'leading-relaxed',
                headline ? 'mt-3 text-ink-2' : 'mt-2 text-xl',
              )}
            >
              {inquiry.answer}
            </p>
            <CiteChips
              evidence={inquiry.citations}
              onCite={onCite}
              numbered={numbered}
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1">
            <Icon name="shield" size={13} /> Rules and source metadata chose the
            applicable source
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="spark" size={13} /> AI wrote the wording; each claim was
            checked against citations
          </span>
          <span>
            Evidence: <strong className="text-ink-2">Supported</strong>
          </span>
        </div>
      </section>
    );
  }

  if (status === 'INSUFFICIENT_EVIDENCE' || status === 'NEEDS_CLARIFICATION') {
    const owner = inquiry.escalation?.owner;
    return (
      <Card
        tone="warn"
        icon="alert"
        title={
          status === 'NEEDS_CLARIFICATION'
            ? 'Can you add a little detail?'
            : 'I don’t have enough evidence to answer'
        }
      >
        <p className="leading-relaxed text-ink-2">{inquiry.answer}</p>
        {owner && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand-strong">
              <Icon name="user" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-3">The right person to ask</p>
              <p className="font-semibold">{owner.name}</p>
            </div>
            <a
              href={`mailto:${owner.contact_email}?subject=${encodeURIComponent(inquiry.question)}`}
              className="inline-flex items-center gap-2 rounded-full border border-brand px-4 py-2 text-sm font-semibold text-brand-strong hover:bg-brand-soft"
            >
              <Icon name="mail" size={15} />
              {owner.contact_email}
            </a>
          </div>
        )}
        <p className="mt-4 text-xs text-ink-3">
          Veridict abstains rather than guessing when no permitted source
          supports an answer.
        </p>
      </Card>
    );
  }

  if (status === 'NEEDS_REVALIDATION')
    return (
      <Card
        tone="risk"
        icon="refresh"
        title="The sources behind this answer have changed"
      >
        <p className="leading-relaxed text-ink-2">
          A newer approved source replaced evidence this answer relied on, so
          the old answer is hidden. Ask again to get an answer from the current
          rule.
        </p>
        <Button className="mt-4" onClick={askAgain}>
          <Icon name="refresh" size={15} />
          Ask again with current sources
        </Button>
      </Card>
    );

  return (
    <Card tone="neutral" icon="lock" title="Information not available">
      <p className="leading-relaxed text-ink-2">
        {inquiry.answer ??
          'Informasi tidak tersedia untuk menjawab pertanyaan ini.'}
      </p>
      <p className="mt-4 text-xs text-ink-3">
        Veridict gives this same reply whether a topic is restricted or simply
        doesn&apos;t exist, so it never reveals what you can&apos;t access.
      </p>
    </Card>
  );
}

function Card({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'risk' | 'neutral';
  icon: 'clock' | 'alert' | 'refresh' | 'lock';
  title: string;
  children: React.ReactNode;
}) {
  const t = {
    info: 'border-info/30 bg-info-soft text-info',
    warn: 'border-warn/30 bg-warn-soft text-warn',
    risk: 'border-risk/30 bg-risk-soft text-risk',
    neutral: 'border-line bg-surface-2 text-ink-2',
  }[tone];
  return (
    <section
      className={cx(
        'mt-8 rounded-2xl border p-6 sm:p-7',
        t.split(' ').slice(0, 2).join(' '),
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cx(
            'grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface',
            t.split(' ')[2],
            tone === 'info' && 'vd-pulse',
          )}
        >
          <Icon name={icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </section>
  );
}

function CiteChips({
  evidence,
  onCite,
  numbered,
}: {
  evidence: Citation[];
  onCite(c: Citation): void;
  numbered(c: Citation): number;
}) {
  if (!evidence.length) return null;
  return (
    <span className="mt-3 flex flex-wrap gap-1.5">
      {evidence.map((c) => {
        const n = numbered(c);
        return (
          <button
            key={c.chunk_id}
            type="button"
            onClick={() => onCite(c)}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2 hover:border-brand hover:text-brand-strong"
            aria-label={`Open source ${n > 0 ? n : ''}`}
          >
            <Icon name="doc" size={12} />
            {n > 0 ? `Source ${n}` : 'Source'}
          </button>
        );
      })}
    </span>
  );
}

function Reconciliation({
  inquiry,
  onCite,
  numbered,
}: {
  inquiry: Inquiry;
  onCite(c: Citation): void;
  numbered(c: Citation): number;
}) {
  const conflicts = inquiry.conflicts.filter((c): c is Statement => Boolean(c));
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold tracking-tight">Truth reconciliation</h2>
      <p className="mt-1 text-sm text-ink-2">
        The formal rule and past practice are kept separate. Practice never
        overrides policy.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Truth
          icon="shield"
          label="Official rule"
          tone="text-ok bg-ok-soft"
          statement={inquiry.official_truth}
          empty="No formal rule was needed for this answer."
          onCite={onCite}
          numbered={numbered}
        />
        <Truth
          icon="history"
          label="What happened before"
          tone="text-info bg-info-soft"
          statement={inquiry.operational_truth}
          empty="No validated past cases were relevant."
          onCite={onCite}
          numbered={numbered}
        />
      </div>
      {conflicts.length > 0 && (
        <div className="mt-4 rounded-2xl border border-warn/40 bg-warn-soft p-5">
          <p className="inline-flex items-center gap-2 font-semibold text-warn">
            <Icon name="alert" size={17} />
            {conflicts.length === 1
              ? 'Conflict found and explained'
              : `${conflicts.length} conflicts found and explained`}
          </p>
          <ul className="mt-2 space-y-3">
            {conflicts.map((c, i) => (
              <li key={i}>
                <p className="leading-relaxed">{c.statement}</p>
                <CiteChips
                  evidence={c.evidence}
                  onCite={onCite}
                  numbered={numbered}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Truth({
  icon,
  label,
  tone,
  statement,
  empty,
  onCite,
  numbered,
}: {
  icon: 'shield' | 'history';
  label: string;
  tone: string;
  statement: Statement | null;
  empty: string;
  onCite(c: Citation): void;
  numbered(c: Citation): number;
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-line bg-surface p-5',
        !statement && 'border-dashed',
      )}
    >
      <p className="inline-flex items-center gap-2 text-sm font-semibold">
        <span
          className={cx('grid h-7 w-7 place-items-center rounded-full', tone)}
        >
          <Icon name={icon} size={15} />
        </span>
        {label}
      </p>
      {statement ? (
        <>
          <p className="mt-3 text-lg font-semibold leading-snug">
            {statement.statement}
          </p>
          <CiteChips
            evidence={statement.evidence}
            onCite={onCite}
            numbered={numbered}
          />
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-3">{empty}</p>
      )}
    </div>
  );
}

function TextList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2">{empty}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TraceDisclosure({ id }: { id: string }) {
  const { client } = useSession();
  const [events, setEvents] = useState<TraceEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);
  const onOpen = () => {
    if (loaded.current || !client) return;
    loaded.current = true;
    client
      .trace(id)
      .then(setEvents)
      .catch(() => setFailed(true));
  };
  return (
    <Disclosure
      onOpen={onOpen}
      icon="layers"
      eyebrow="Activity log"
      title="Tool calls and audit events"
      badge={
        <Pill tone="neutral" icon="lock">
          Owner only
        </Pill>
      }
    >
      {failed ? (
        <p className="text-sm text-ink-2">The activity log is not available.</p>
      ) : !events ? (
        <p className="vd-pulse text-sm text-ink-3">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-ink-2">No events recorded.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-line pl-5">
          {events.map((e) => (
            <li key={e.event_id} className="relative">
              <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">
                  {e.event_type}
                </span>
                {e.decision && (
                  <Pill tone={e.decision === 'DENIED' ? 'risk' : 'neutral'}>
                    {e.decision}
                  </Pill>
                )}
              </div>
              <p className="text-xs text-ink-3">
                {formatDate(e.created_at, true)}
                {e.resource_refs.length > 0 &&
                  ` · ${e.resource_refs.length} resources`}
                {e.tool_call_id && ` · ${e.tool_call_id}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Disclosure>
  );
}

const ACTIONS: { value: FeedbackAction; label: string; hint: string }[] = [
  {
    value: 'CONFIRM',
    label: 'Correct',
    hint: 'The answer matches what you know.',
  },
  {
    value: 'DISPUTE',
    label: 'Wrong',
    hint: 'Something in the answer is incorrect.',
  },
  {
    value: 'EXCEPTION',
    label: 'Exception',
    hint: 'An approved exception applies to a case.',
  },
  {
    value: 'COMMENT',
    label: 'Comment',
    hint: 'Anything else the policy owner should know.',
  },
];

function guessDomain(q: string) {
  const s = q.toLowerCase();
  if (/saas|renewal|procure|vendor|approver/.test(s)) return 'procurement';
  return 'fuel';
}

function Feedback({ inquiry }: { inquiry: Inquiry }) {
  const { client } = useSession();
  const [action, setAction] = useState<FeedbackAction>('CONFIRM');
  const [domain, setDomain] = useState(() => guessDomain(inquiry.question));
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setState('sending');
    try {
      await client.submitFeedback({
        inquiry_id: inquiry.inquiry_id,
        domain,
        action,
        reason: reason.trim(),
      });
      setState('sent');
    } catch (err) {
      setState('error');
      setMessage(
        err instanceof Error ? err.message : 'Could not send feedback.',
      );
    }
  };

  return (
    <section className="mt-10 overflow-hidden rounded-2xl border border-brand/40">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-brand-soft px-5 py-3">
        <p className="inline-flex items-center gap-2 font-semibold text-brand-strong">
          <Icon name="user" size={17} />
          Your call
        </p>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
          <Pill tone="neutral">You report</Pill>›
          <Pill tone="neutral">Owner reviews</Pill>›
          <Pill tone="brand">Becomes precedent</Pill>
        </span>
      </header>
      {state === 'sent' ? (
        <div className="flex items-start gap-3 bg-surface p-5">
          <Icon name="check" size={20} className="mt-0.5 text-ok" />
          <div>
            <p className="font-semibold">Sent for review</p>
            <p className="text-sm text-ink-2">
              It stays <strong>pending</strong> until an authorized {domain}{' '}
              reviewer validates it. Feedback never changes policy on its own.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 bg-surface p-5">
          <fieldset>
            <legend className="text-sm font-medium">
              Is this answer right?
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <label
                  key={a.value}
                  className={cx(
                    'cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold',
                    action === a.value
                      ? 'border-brand bg-brand text-brand-ink'
                      : 'border-line-strong text-ink-2 hover:border-brand',
                  )}
                >
                  <input
                    type="radio"
                    name="action"
                    value={a.value}
                    checked={action === a.value}
                    onChange={() => setAction(a.value)}
                    className="sr-only"
                  />
                  {a.label}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">
              {ACTIONS.find((a) => a.value === action)?.hint}
            </p>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <label className="block text-sm font-medium">
              Policy area
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-ink"
              >
                <option value="fuel">Fuel &amp; reimbursement</option>
                <option value="procurement">Procurement</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Why?
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={4000}
                rows={2}
                placeholder="Tell the policy owner what you know"
                className="mt-1.5 w-full resize-y rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-ink placeholder:text-ink-3"
              />
            </label>
          </div>
          {state === 'error' && (
            <p role="alert" className="text-sm text-risk">
              {message}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <Button
              type="submit"
              disabled={state === 'sending' || !reason.trim()}
            >
              {state === 'sending' ? 'Sending…' : 'Send for review'}
            </Button>
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              <Icon name="shield" size={13} />
              Only a reviewer for this area can approve it
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
