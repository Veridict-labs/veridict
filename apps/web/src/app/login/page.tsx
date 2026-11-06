'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Button, Logo, ThemeToggle } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function LoginPage() {
  const { ready, client, signIn, startDemo } = useSession();
  const router = useRouter();
  const [org, setOrg] = useState('veridict-demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // Shareable demo link: /login?demo=1&next=/console/inquiry/demo-fuel
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    const target = next?.startsWith('/console') ? next : '/console';
    if (client) router.replace(target);
    else if (params.get('demo') === '1')
      void startDemo().then(() => router.replace(target));
  }, [ready, client, router, startDemo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(org.trim(), email.trim(), password);
      router.replace('/console');
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Cannot reach the Veridict API. Is the backend running?'
          : err instanceof Error
            ? err.message
            : 'Sign-in failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const field =
    'mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20';

  return (
    <div className="flex min-h-screen flex-col bg-hero">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-line bg-surface p-7 shadow-card">
            <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-ink-2">
              Your role and department decide which sources you can see.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Organization
                <input
                  className={field}
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  required
                  autoComplete="organization"
                />
              </label>
              <label className="block text-sm font-medium">
                Email
                <input
                  className={field}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="employee@example.test"
                  required
                  autoComplete="username"
                />
              </label>
              <label className="block text-sm font-medium">
                Password
                <input
                  className={field}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-risk-soft px-3 py-2.5 text-sm text-risk"
                >
                  <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy} className="w-full py-3">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs text-ink-3">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <Button
              variant="outline"
              className="w-full py-3"
              onClick={async () => {
                await startDemo();
                router.replace('/console');
              }}
            >
              <Icon name="spark" size={16} />
              Explore with demo data
            </Button>
            <p className="mt-3 text-center text-xs leading-relaxed text-ink-3">
              Runs entirely in your browser with synthetic answers. No agent is
              called.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
