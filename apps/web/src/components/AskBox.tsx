'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SUGGESTED_QUESTIONS } from '@/lib/demo-data';
import { questionCache, useSession } from '@/lib/session';
import { Icon } from './Icon';

export const RUN_FLAG = (id: string) => `vd-run-${id}`;

export function AskBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const { client } = useSession();
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || !client) return;
    setBusy(true);
    setError(null);
    try {
      const id = await client.ask(text);
      questionCache.set(id, text);
      try {
        sessionStorage.setItem(RUN_FLAG(id), '1');
      } catch {}
      router.push(`/console/inquiry/${id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not send the question.',
      );
      setBusy(false);
    }
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="rounded-2xl border border-line-strong bg-surface p-2 shadow-card focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
      >
        <label htmlFor="vd-question" className="sr-only">
          Your question
        </label>
        <textarea
          id="vd-question"
          autoFocus={autoFocus}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Tanya apa saja tentang reimbursement, cuti, atau approval… / Ask in English or Indonesian"
          className="block w-full resize-none bg-transparent px-3 py-2 text-base text-ink outline-none placeholder:text-ink-3"
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="inline-flex items-center gap-1 text-xs text-ink-3">
            <Icon name="lock" size={13} />
            Only sources you can access
          </span>
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-strong disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Ask Veridict'}
            <Icon name="send" size={15} />
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-risk">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => void ask(q)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-sm text-ink-2 hover:border-brand hover:text-brand-strong"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
