'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { dataPurposes, personalDataKind, type PersonalDataKind } from '@veridict/contracts';
import { useSession } from '@/lib/session';
import type { Citation } from '@/lib/types';
import { RUN_FLAG } from './AskBox';
import { Button } from './ui';

const labels: Record<PersonalDataKind, { name: string; purpose: string }> = {
  NIK: { name: 'National identity number (NIK)', purpose: 'verify identity' },
  PHONE: { name: 'Phone number', purpose: 'contact the person' },
  EMAIL: { name: 'Email address', purpose: 'contact the person' },
  ADDRESS: { name: 'Address', purpose: 'fulfill a service' },
  DATE_OF_BIRTH: { name: 'Date of birth', purpose: 'verify identity' },
  BANK_ACCOUNT: { name: 'Bank account', purpose: 'process reimbursement' },
  NAME: { name: 'Name', purpose: 'identify the person' },
  NPWP: { name: 'Tax identity number (NPWP)', purpose: 'administer taxes' },
  PASSPORT_NUMBER: { name: 'Passport number', purpose: 'verify identity' },
  SALARY: { name: 'Salary', purpose: 'administer payroll' },
  HEALTH_INFORMATION: { name: 'Health information', purpose: 'administer benefits' },
};

export function PersonalDataRequestForm({ citation }: { citation: Citation }) {
  const { client } = useSession();
  const router = useRouter();
  const [field, setField] = useState<PersonalDataKind>('PHONE');
  const [question, setQuestion] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (client?.mode !== 'live') return null;

  const submit = async () => {
    if (!client || !confirmed || !question.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await client.ask(question.trim(), {
        source_id: citation.source_id,
        chunk_id: citation.chunk_id,
        field_type: field,
        purpose: dataPurposes[field],
      });
      try {
        sessionStorage.setItem(RUN_FLAG(id), '1');
      } catch {}
      router.push(`/console/inquiry/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your request.');
      setBusy(false);
    }
  };

  return (
    <details className="mt-5 rounded-xl border border-line p-4">
      <summary className="cursor-pointer font-semibold">Request a personal value</summary>
      <p className="mt-3 text-sm text-ink-2">
        Request one value from this excerpt only when needed for the stated purpose.
        Your current permissions are checked before release. Other personal data stays masked.
      </p>
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="block text-sm font-medium">
          Personal data category
          <select className="mt-1 block w-full rounded-lg border border-line bg-surface p-2" value={field}
            onChange={(e) => { setField(e.target.value as PersonalDataKind); setConfirmed(false); }} disabled={busy}>
            {personalDataKind.options.map((kind) => <option key={kind} value={kind}>{labels[kind].name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Explicit request
          <textarea className="mt-1 block w-full rounded-lg border border-line bg-surface p-2" value={question}
            onChange={(e) => { setQuestion(e.target.value); setConfirmed(false); }} required minLength={3} maxLength={4000} rows={3}
            placeholder="Ask for the actual value and explain why you need it." disabled={busy} />
        </label>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" required checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
          I need this value to {labels[field].purpose}.
        </label>
        {error && <p role="alert" className="text-sm text-risk">{error}</p>}
        <Button type="submit" disabled={busy || !confirmed || !question.trim()}>
          {busy ? 'Creating request…' : 'Check access and request value'}
        </Button>
      </form>
    </details>
  );
}
