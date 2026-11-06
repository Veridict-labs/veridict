'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AskBox } from '@/components/AskBox';
import { Icon } from '@/components/Icon';
import { StatusBadge, cx, formatDate, statusInfo } from '@/components/ui';
import { questionCache, useSession } from '@/lib/session';
import type { InquiryStatus, InquirySummary } from '@/lib/types';

const ATTENTION: InquiryStatus[] = [
  'NEEDS_REVALIDATION',
  'NEEDS_CLARIFICATION',
  'INSUFFICIENT_EVIDENCE',
  'PENDING',
];

function greeting() {
  const h = new Date().getHours();
  return h < 11
    ? 'Selamat pagi'
    : h < 15
      ? 'Selamat siang'
      : h < 18
        ? 'Selamat sore'
        : 'Selamat malam';
}

export default function ConsoleHome() {
  const { client, me } = useSession();
  const [items, setItems] = useState<InquirySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    client
      .listInquiries()
      .then((rows) =>
        setItems(
          rows
            .map((r) => ({
              ...r,
              question: r.question ?? questionCache.get(r.inquiry_id),
            }))
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        ),
      )
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : 'Could not load your questions.',
        ),
      );
  }, [client]);

  const attention = (items ?? []).filter((i) => ATTENTION.includes(i.status));
  const done = (items ?? []).filter((i) => !ATTENTION.includes(i.status));
  const answered = done.filter((i) => i.status === 'ANSWERED').length;

  return (
    <div className="mx-auto max-w-4xl">
      <section className="rounded-3xl bg-hero p-6 sm:p-8">
        <p className="text-sm font-medium text-brand-strong">
          {greeting()}
          {me?.name ? `, ${me.name}` : ''}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          What do you need to know today?
        </h1>
        <p className="mt-2 text-ink-2">
          Answers cite the exact source, and say so when the evidence isn&apos;t
          there.
        </p>
        <div className="mt-6">
          <AskBox />
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat
          value={items ? answered : '–'}
          label="answered with citations"
          icon="check"
          tone="text-ok"
        />
        <Stat
          value={items ? attention.length : '–'}
          label="need your attention"
          icon="alert"
          tone="text-warn"
        />
        <Stat
          value={items ? items.length : '–'}
          label="questions asked"
          icon="ask"
          tone="text-brand"
        />
      </section>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-risk-soft px-4 py-3 text-sm text-risk"
        >
          {error}
        </p>
      )}

      {items && items.length === 0 && (
        <p className="mt-8 rounded-2xl border border-dashed border-line-strong p-8 text-center text-ink-3">
          No questions yet. Try one of the suggestions above.
        </p>
      )}

      {attention.length > 0 && (
        <List
          title="Needs attention"
          note="Revalidation first, then newest"
          items={attention.sort(
            (a, b) => ATTENTION.indexOf(a.status) - ATTENTION.indexOf(b.status),
          )}
          emphasis
        />
      )}
      {done.length > 0 && (
        <List title="Answered" note="Newest first" items={done} />
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  icon,
  tone,
}: {
  value: number | string;
  label: string;
  icon: 'check' | 'alert' | 'ask';
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <Icon name={icon} size={18} className={tone} />
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="text-sm text-ink-2">{label}</p>
    </div>
  );
}

function List({
  title,
  note,
  items,
  emphasis,
}: {
  title: string;
  note: string;
  items: InquirySummary[];
  emphasis?: boolean;
}) {
  return (
    <section
      className={cx(
        'mt-8 overflow-hidden rounded-2xl border bg-surface',
        emphasis ? 'border-warn/40' : 'border-line',
      )}
    >
      <header
        className={cx(
          'flex items-center justify-between px-5 py-3',
          emphasis ? 'bg-warn-soft' : 'bg-surface-2',
        )}
      >
        <h2 className={cx('font-semibold', emphasis && 'text-warn')}>
          {title}
        </h2>
        <span className="text-xs text-ink-3">{note}</span>
      </header>
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.inquiry_id}>
            <Link
              href={`/console/inquiry/${i.inquiry_id}`}
              className="flex items-center gap-3 px-5 py-4 hover:bg-surface-2"
            >
              <Icon
                name={statusInfo(i.status).icon}
                size={17}
                className="shrink-0 text-ink-3"
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {i.question ?? `Question from ${formatDate(i.created_at)}`}
              </span>
              <span className="hidden sm:block">
                <StatusBadge status={i.status} />
              </span>
              <span className="hidden text-sm text-ink-3 sm:block">
                {formatDate(i.created_at, true)}
              </span>
              <Icon name="arrow" size={16} className="shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
