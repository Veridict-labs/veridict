'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Button, Pill, cx, formatDate } from '@/components/ui';
import { questionCache, useSession } from '@/lib/session';
import type { FeedbackAction, PendingFeedback } from '@/lib/types';

const ACTION: Record<
  FeedbackAction,
  { label: string; tone: 'ok' | 'risk' | 'warn' | 'neutral' }
> = {
  CONFIRM: { label: 'Confirms answer', tone: 'ok' },
  DISPUTE: { label: 'Disputes answer', tone: 'risk' },
  EXCEPTION: { label: 'Reports exception', tone: 'warn' },
  COMMENT: { label: 'Comment', tone: 'neutral' },
};

export default function ReviewPage() {
  const { client, me } = useSession();
  const domains = me?.review_domains ?? [];
  const [domain, setDomain] = useState(domains[0] ?? '');
  const [items, setItems] = useState<PendingFeedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !domain) return;
    let live = true;
    client
      .pendingFeedback(domain)
      .then((rows) => live && setItems(rows))
      .catch(
        (e) =>
          live &&
          setError(
            e instanceof Error ? e.message : 'Could not load the review queue.',
          ),
      );
    return () => {
      live = false;
    };
  }, [client, domain]);

  const switchDomain = (d: string) => {
    setItems(null);
    setError(null);
    setDomain(d);
  };

  if (!domains.length)
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-8 text-center">
        <Icon name="lock" size={24} className="mx-auto text-ink-3" />
        <p className="mt-2 font-semibold">
          You don&apos;t review any policy area
        </p>
        <p className="mt-1 text-sm text-ink-2">
          Only reviewers assigned to a domain can validate feedback for it.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight">Review feedback</h1>
      <p className="mt-2 text-ink-2">
        Feedback becomes a reusable precedent only after you validate it. It
        never rewrites a policy.
      </p>

      <div
        role="tablist"
        aria-label="Policy area"
        className="mt-6 inline-flex rounded-full border border-line bg-surface p-1"
      >
        {domains.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === domain}
            type="button"
            onClick={() => switchDomain(d)}
            className={cx(
              'rounded-full px-4 py-1.5 text-sm font-semibold capitalize',
              d === domain
                ? 'bg-brand text-brand-ink'
                : 'text-ink-2 hover:text-ink',
            )}
          >
            {d}
          </button>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-risk-soft px-4 py-3 text-sm text-risk"
        >
          {error}
        </p>
      )}
      {!items && !error && <p className="vd-pulse mt-6 text-ink-3">Loading…</p>}
      {items?.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong p-10 text-center text-ink-3">
          <Icon name="check" size={22} className="mx-auto text-ok" />
          <p className="mt-2">Nothing waiting for review in {domain}.</p>
        </div>
      )}
      <ul className="mt-6 space-y-4">
        {items?.map((f) => (
          <ReviewCard
            key={f.feedback_id}
            item={f}
            onDone={() =>
              setItems(
                (all) =>
                  all?.filter((x) => x.feedback_id !== f.feedback_id) ?? null,
              )
            }
          />
        ))}
      </ul>
    </div>
  );
}

function ReviewCard({
  item,
  onDone,
}: {
  item: PendingFeedback;
  onDone(): void;
}) {
  const { client } = useSession();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'VALIDATED' | 'REJECTED' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const question = item.question ?? questionCache.get(item.inquiry_id);
  const a = ACTION[item.action];

  const decide = async (decision: 'VALIDATED' | 'REJECTED') => {
    if (!client) return;
    setBusy(decision);
    setError(null);
    try {
      await client.reviewFeedback(item.feedback_id, decision, note.trim());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the decision.');
      setBusy(null);
    }
  };

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={a.tone}>{a.label}</Pill>
          <Pill tone="neutral" icon="clock">
            Pending review
          </Pill>
          <span className="text-xs text-ink-3">
            {formatDate(item.created_at, true)}
          </span>
        </div>
        <Link
          href={`/console/inquiry/${item.inquiry_id}`}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-strong underline-offset-4 hover:underline"
        >
          {question ?? 'Open the original question'}
          <Icon name="arrow" size={14} />
        </Link>
        <blockquote className="mt-3 rounded-xl bg-surface-2 px-4 py-3 leading-relaxed">
          {item.reason}
        </blockquote>
      </div>
      <div className="border-t border-line bg-bg p-5">
        <label className="block text-sm font-medium">
          Your reason
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Required: why you validate or reject this"
            className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-ink placeholder:text-ink-3"
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-sm text-risk">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            disabled={!note.trim() || busy !== null}
            onClick={() => decide('VALIDATED')}
          >
            <Icon name="check" size={15} />
            {busy === 'VALIDATED' ? 'Saving…' : 'Validate'}
          </Button>
          <Button
            variant="outline"
            disabled={!note.trim() || busy !== null}
            onClick={() => decide('REJECTED')}
          >
            <Icon name="x" size={15} />
            {busy === 'REJECTED' ? 'Saving…' : 'Reject'}
          </Button>
          <span className="inline-flex items-center gap-1 text-xs text-ink-3">
            <Icon name="layers" size={13} />
            Every decision is written to the audit log
          </span>
        </div>
      </div>
    </li>
  );
}
