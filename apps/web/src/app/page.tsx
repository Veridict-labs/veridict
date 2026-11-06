import Link from 'next/link';
import { Icon, type IconName } from '@/components/Icon';
import { Logo, ThemeToggle } from '@/components/ui';

const TRUTHS: { icon: IconName; title: string; body: string; tone: string }[] =
  [
    {
      icon: 'shield',
      title: 'Official truth',
      body: 'The formal rule that applies now, after checking who issued it, its scope, its dates and what it replaces.',
      tone: 'bg-ok-soft text-ok',
    },
    {
      icon: 'history',
      title: 'Operational truth',
      body: 'What actually happened in comparable, human-validated past cases. Shown as practice, never promoted to policy.',
      tone: 'bg-info-soft text-info',
    },
    {
      icon: 'clock',
      title: 'Temporal truth',
      body: 'What applied when you asked versus what applies today. Old answers are flagged when their evidence changes.',
      tone: 'bg-warn-soft text-warn',
    },
  ];

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'ask',
    title: 'Ask in any language',
    body: 'Bahasa Indonesia, English, or both in one sentence.',
  },
  {
    icon: 'lock',
    title: 'Permissions first',
    body: 'Sources you cannot see are filtered out before the AI reads anything.',
  },
  {
    icon: 'scale',
    title: 'Resolve conflicts',
    body: 'Authority, supersession and validity dates decide which rule wins.',
  },
  {
    icon: 'check',
    title: 'Verify every claim',
    body: 'Each statement must map to a cited excerpt, or the answer abstains.',
  },
  {
    icon: 'layers',
    title: 'Leave a trail',
    body: 'Citations, reasoning steps and an audit log you can open and check.',
  },
];

const NEVER = [
  'Reveal content you are not allowed to see, or even that it exists',
  'Follow instructions hidden inside documents or chats',
  'Approve transactions, send messages or move money',
  'Rewrite policy or turn feedback into precedent without a human reviewer',
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <section className="bg-hero">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="flex items-center justify-between py-5">
            <Logo />
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-brand-strong underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
              <ThemeToggle />
            </div>
          </nav>

          <div className="grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-24">
            <div>
              <p className="text-sm font-semibold text-brand-strong">
                Trusted organizational knowledge
              </p>
              <h1 className="mt-4 text-6xl font-extrabold tracking-tight sm:text-7xl">
                Veridict<span className="text-brand">.</span>
              </h1>
              <p className="mt-6 max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                The right answer, from the rule that actually applies.
              </p>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-2">
                Ask about reimbursement, leave or approvals. Veridict reads only
                what you&apos;re allowed to see, works out which source is
                current, and cites every claim.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-7 py-4 text-lg font-bold text-brand-ink hover:bg-brand-strong"
                >
                  Open Veridict
                  <Icon name="arrow" size={20} strokeWidth={2.4} />
                </Link>
                <a
                  href="#how"
                  className="text-sm font-medium text-brand-strong underline underline-offset-4"
                >
                  See how it works
                </a>
              </div>
            </div>

            <HeroCard />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-3">
            The problem
          </p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight">
            New hires shouldn&apos;t need to ask three people to find one rule.
          </h2>
        </div>
        <div className="space-y-4 text-lg leading-relaxed text-ink-2">
          <p>
            Policies live across drives, chat threads and task boards. Old SOPs
            stay online after HR replaces them, and senior staff answer the same
            questions every week.
          </p>
          <p>
            A plain chatbot makes it worse: it can quote the outdated rule with
            confidence, or leak salary and confidential project details to
            someone who shouldn&apos;t see them.
          </p>
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-3">
            Truth reconciliation
          </p>
          <h2 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight">
            Three kinds of truth, kept apart on purpose.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {TRUTHS.map((t) => (
              <div
                key={t.title}
                className="rounded-2xl border border-line bg-bg p-6"
              >
                <span
                  className={`grid h-11 w-11 place-items-center rounded-xl ${t.tone}`}
                >
                  <Icon name={t.icon} size={22} />
                </span>
                <h3 className="mt-4 text-lg font-bold">{t.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-2">{t.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-warn/30 bg-warn-soft p-6">
            <p className="text-sm font-semibold text-warn">Example</p>
            <p className="mt-1 text-lg leading-relaxed">
              Policy says a <strong>Director</strong> approves SaaS renewals
              above Rp100M, but 23 of 26 past renewals were approved by a{' '}
              <strong>VP</strong>. Veridict answers &ldquo;Director&rdquo;,
              shows the history, and flags the gap for the policy owner. The
              habit never becomes the rule.
            </p>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-3">
          How it works
        </p>
        <h2 className="mt-3 text-4xl font-bold tracking-tight">
          From question to checked answer.
        </h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="rounded-2xl border border-line bg-surface p-5"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand-strong">
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="text-sm font-bold text-ink-3">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-3">
              Accountability
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">
              What Veridict will never do.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-2">
              It is a knowledge system, not an approval or payment agent. People
              stay in charge of policy and precedent.
            </p>
          </div>
          <ul className="space-y-3">
            {NEVER.map((n) => (
              <li
                key={n}
                className="flex gap-3 rounded-xl border border-line bg-bg p-4"
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-risk-soft text-risk">
                  <Icon name="x" size={14} strokeWidth={2.6} />
                </span>
                <span className="leading-relaxed">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p>
            Tencent Cloud Hackathon Indonesia 2026 · Challenge A. Demo data is
            synthetic.
          </p>
        </div>
      </footer>
    </div>
  );
}

function HeroCard() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -right-3 -top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold shadow-card">
        <span className="h-2 w-2 rounded-full bg-ok" />
        Every claim cited
      </div>
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
        <p className="text-sm text-ink-3">
          Berapa tunjangan bensin bulanan yang berlaku?
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-semibold text-ok">
            <Icon name="check" size={13} strokeWidth={2.4} />
            Answered
          </span>
          <span className="text-xs text-ink-3">Supported by 2 sources</span>
        </div>
        <p className="mt-3 text-4xl font-extrabold tracking-tight text-ok">
          Rp750.000
        </p>
        <p className="mt-1 text-ink-2">
          per month, under the approved HR update.
        </p>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
            <span className="inline-flex items-center gap-2">
              <Icon name="chat" size={15} className="text-ink-3" />
              Authorized HR fuel update
            </span>
            <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">
              Approved
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-3">
            <span className="inline-flex items-center gap-2 line-through decoration-ink-3/60">
              <Icon name="doc" size={15} />
              Old fuel SOP · Rp500.000
            </span>
            <span className="rounded-full bg-risk-soft px-2 py-0.5 text-xs font-semibold text-risk no-underline">
              Superseded
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
