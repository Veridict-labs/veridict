'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { demoClient, liveClient, login, type VeridictClient } from './api';
import type { Me } from './types';

type Stored = { mode: 'live'; token: string } | { mode: 'demo' };
type SessionState = {
  ready: boolean;
  client: VeridictClient | null;
  me: Me | null;
  signIn(org: string, email: string, password: string): Promise<void>;
  startDemo(): Promise<void>;
  signOut(): Promise<void>;
};

const KEY = 'vd-session';
const Ctx = createContext<SessionState | null>(null);

function clearLegacyQuestions() {
  try {
    localStorage.removeItem('vd-questions');
  } catch {}
}

function read(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function write(value: Stored | null) {
  try {
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } catch {}
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [client, setClient] = useState<VeridictClient | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const activate = useCallback(async (stored: Stored) => {
    clearLegacyQuestions();
    const next =
      stored.mode === 'demo' ? demoClient() : liveClient(stored.token);
    const profile = await next.me();
    write(stored);
    setClient(next);
    setMe(profile);
  }, []);

  useEffect(() => {
    // Restore a saved session once; all state updates happen after the awaited profile call.
    const restore = async () => {
      clearLegacyQuestions();
      const stored = read();
      try {
        if (stored) await activate(stored);
      } catch {
        write(null);
      }
      setReady(true);
    };
    void restore();
  }, [activate]);

  const value = useMemo<SessionState>(
    () => ({
      ready,
      client,
      me,
      async signIn(org, email, password) {
        const { access_token } = await login(org, email, password);
        await activate({ mode: 'live', token: access_token });
      },
      startDemo: () => activate({ mode: 'demo' }),
      async signOut() {
        try {
          await client?.logout();
        } finally {
          clearLegacyQuestions();
          write(null);
          setClient(null);
          setMe(null);
        }
      },
    }),
    [ready, client, me, activate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
