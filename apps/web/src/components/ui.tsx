'use client';

import Link from 'next/link';
import { Icon, type IconName } from './Icon';
import type { InquiryStatus, SourceState, SourceType } from '@/lib/types';

export function cx(...v: (string | false | null | undefined)[]) {
  return v.filter(Boolean).join(' ');
}

export function Logo({
  href = '/',
  size = 'md',
}: {
  href?: string;
  size?: 'md' | 'lg';
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-ink"
      aria-label="Veridict home"
    >
      <span
        className={cx(
          'grid place-items-center rounded-lg bg-brand text-brand-ink',
          size === 'lg' ? 'h-10 w-10' : 'h-8 w-8',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          width={size === 'lg' ? 22 : 18}
          height={size === 'lg' ? 22 : 18}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6l6 13L20 5" />
          <path d="M14 11h5" />
        </svg>
      </span>
      <span
        className={cx(
          'font-bold tracking-tight',
          size === 'lg' ? 'text-2xl' : 'text-lg',
        )}
      >
        Veridict
      </span>
    </Link>
  );
}

export function ThemeToggle() {
  // The layout script always sets data-theme before paint, so CSS can pick the icon.
  const toggle = () => {
    const next =
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('vd-theme', next);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:text-ink"
      aria-label="Toggle light or dark theme"
    >
      <Icon name="moon" size={17} className="dark:hidden" />
      <Icon name="sun" size={17} className="hidden dark:block" />
    </button>
  );
}

const STATUS: Record<
  InquiryStatus,
  { label: string; tone: Tone; icon: IconName }
> = {
  ANSWERED: { label: 'Answered', tone: 'ok', icon: 'check' },
  PENDING: { label: 'Working', tone: 'info', icon: 'clock' },
  NEEDS_CLARIFICATION: {
    label: 'Needs clarification',
    tone: 'warn',
    icon: 'info',
  },
  INSUFFICIENT_EVIDENCE: {
    label: 'Not enough evidence',
    tone: 'warn',
    icon: 'alert',
  },
  UNAVAILABLE: { label: 'Unavailable', tone: 'neutral', icon: 'lock' },
  NEEDS_REVALIDATION: {
    label: 'Needs revalidation',
    tone: 'risk',
    icon: 'refresh',
  },
};

export function statusInfo(s: InquiryStatus) {
  return STATUS[s];
}

type Tone = 'ok' | 'warn' | 'risk' | 'info' | 'neutral' | 'brand';
const toneClass: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  risk: 'bg-risk-soft text-risk',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-2 text-ink-2',
  brand: 'bg-brand-soft text-brand-strong',
};

export function Pill({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: IconName;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        toneClass[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={13} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: InquiryStatus }) {
  const s = STATUS[status];
  return (
    <Pill
      tone={s.tone}
      icon={s.icon}
      className={status === 'PENDING' ? 'vd-pulse' : undefined}
    >
      {s.label}
    </Pill>
  );
}

const TYPE_ICON: Record<SourceType, IconName> = {
  DOCUMENT: 'doc',
  CHAT: 'chat',
  TASK: 'task',
};
const TYPE_LABEL: Record<SourceType, string> = {
  DOCUMENT: 'Document',
  CHAT: 'Chat',
  TASK: 'Task',
};
const STATE: Record<SourceState, { label: string; tone: Tone }> = {
  APPROVED: { label: 'Approved', tone: 'ok' },
  OFFICIAL_INTERNAL: { label: 'Official internal', tone: 'ok' },
  INFORMAL: { label: 'Informal', tone: 'neutral' },
  DRAFT: { label: 'Draft', tone: 'warn' },
  SUPERSEDED: { label: 'Superseded', tone: 'risk' },
  UNKNOWN: { label: 'Status unknown', tone: 'neutral' },
};

export function SourceTypeLabel({ type }: { type: SourceType }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-2">
      <Icon name={TYPE_ICON[type]} size={14} />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function SourceStatePill({ state }: { state: SourceState }) {
  return <Pill tone={STATE[state].tone}>{STATE[state].label}</Pill>;
}

export function Disclosure({
  icon,
  eyebrow,
  title,
  badge,
  children,
  defaultOpen = false,
  onOpen,
}: {
  icon: IconName;
  eyebrow: string;
  title: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onOpen?: () => void;
}) {
  return (
    <details
      open={defaultOpen}
      onToggle={(e) => e.currentTarget.open && onOpen?.()}
      className="group rounded-xl border border-line bg-surface [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
        <Icon
          name="chevron"
          size={14}
          className="shrink-0 text-ink-3 transition-transform group-open:rotate-90"
        />
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <Icon name={icon} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-ink-3">{eyebrow}</span>
          <span className="block truncate font-semibold">{title}</span>
        </span>
        {badge}
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

export type Step = {
  label: string;
  detail: string;
  icon: IconName;
  state: 'done' | 'active' | 'todo' | 'skipped';
};

export function StepTracker({ steps }: { steps: Step[] }) {
  return (
    <ol
      className="grid gap-y-4"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((s, i) => (
        <li
          key={s.label}
          className="relative flex flex-col items-center text-center"
        >
          {i > 0 && (
            <span
              aria-hidden="true"
              className={cx(
                'absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2',
                s.state === 'todo' || s.state === 'skipped'
                  ? 'bg-line'
                  : 'bg-brand',
              )}
            />
          )}
          <span
            className={cx(
              'relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold',
              s.state === 'done' &&
                'border-brand bg-brand-soft text-brand-strong',
              s.state === 'active' &&
                'border-brand bg-brand text-brand-ink vd-pulse',
              s.state === 'todo' && 'border-line-strong bg-surface text-ink-3',
              s.state === 'skipped' &&
                'border-dashed border-line-strong bg-surface text-ink-3',
            )}
          >
            {s.state === 'done' ? (
              <Icon name="check" size={14} strokeWidth={2.6} />
            ) : (
              i + 1
            )}
          </span>
          <span className="mt-2 hidden items-center gap-1 text-sm font-semibold sm:inline-flex">
            <Icon name={s.icon} size={14} className="text-ink-3" />
            {s.label}
          </span>
          <span className="mt-0.5 hidden text-xs text-ink-3 sm:block">
            {s.detail}
          </span>
          <span className="sr-only">
            {s.label}: {s.detail} ({s.state})
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost';
}) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' &&
          'bg-brand text-brand-ink hover:bg-brand-strong',
        variant === 'outline' &&
          'border border-brand text-brand-strong hover:bg-brand-soft',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
    />
  );
}

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withTime
      ? { hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric' }),
  });
}
