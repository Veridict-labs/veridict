'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';
import { Icon, type IconName } from './Icon';
import { Logo, Pill, ThemeToggle, cx } from './ui';

const NAV: {
  href: string;
  label: string;
  icon: IconName;
  reviewer?: boolean;
}[] = [
  { href: '/console', label: 'Home', icon: 'home' },
  { href: '/console/ask', label: 'Ask', icon: 'ask' },
  { href: '/console/review', label: 'Review', icon: 'review', reviewer: true },
];

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { ready, client, me, signOut } = useSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (ready && !client) router.replace('/login');
  }, [ready, client, router]);

  if (!ready || !client || !me)
    return (
      <div className="grid min-h-screen place-items-center text-ink-3">
        <span className="vd-pulse">Loading…</span>
      </div>
    );

  const canReview = me.role !== 'EMPLOYEE' && me.review_domains.length > 0;
  const nav = NAV.filter((n) => !n.reviewer || canReview);
  const active = (href: string) =>
    href === '/console' ? path === href : path.startsWith(href);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Logo href="/console" />
          <span className="hidden text-sm text-ink-3 sm:inline">
            Workplace answers you can check
          </span>
        </div>
        <div className="flex items-center gap-2">
          {client.mode === 'demo' ? (
            <Pill tone="warn" icon="info">
              Demo data
            </Pill>
          ) : (
            <Pill tone="ok" icon="spark">
              Live
            </Pill>
          )}
          <span className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm md:inline-flex">
            <Icon name="user" size={15} className="text-ink-3" />
            <span className="font-medium">
              {me.name ?? me.role.toLowerCase()}
            </span>
            <span className="text-ink-3">· {me.department}</span>
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace('/login');
            }}
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:text-ink"
            aria-label="Sign out"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </header>

      <div className="flex">
        <nav
          aria-label="Console"
          className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 md:flex"
        >
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? 'page' : undefined}
              className={cx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                active(n.href)
                  ? 'bg-brand-soft text-brand-strong'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Icon name={n.icon} size={17} />
              {n.label}
            </Link>
          ))}
          <div className="mt-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-ink-3">
            <Icon name="shield" size={15} className="mb-1 text-brand" />
            Answers only use sources you are allowed to see. Every answer is
            logged.
          </div>
        </nav>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-8 md:pb-10">
          {children}
        </main>
      </div>

      <nav
        aria-label="Console"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-surface py-2 md:hidden"
      >
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href) ? 'page' : undefined}
            className={cx(
              'flex flex-col items-center gap-0.5 rounded-lg px-4 py-1 text-xs font-medium',
              active(n.href) ? 'text-brand-strong' : 'text-ink-3',
            )}
          >
            <Icon name={n.icon} size={19} />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
